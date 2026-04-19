import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import { getSearchIndex, getChannels, getUsers } from '../api/slack';
import type { Channel } from '@slack-archive/types';

function channelIdFromFile(file: string): string {
  // file is "CL0AVQ3T3.json" → "CL0AVQ3T3"
  return file.replace('.json', '');
}

function channelName(channelId: string, channels: Channel[]): string {
  return channels.find(c => c.id === channelId)?.name ?? channelId;
}

function formatTs(ts: string): string {
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleString();
}

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

export const SearchResults = () => {
  const { workspaceId } = useParams();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const { data: searchIndex = {}, isLoading: indexLoading } = useQuery({
    queryKey: ['searchIndex'],
    queryFn: getSearchIndex,
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: getChannels,
  });

  useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  if (indexLoading) {
    return (
      <div id="messages">
        <div className="loading">Loading search index...</div>
      </div>
    );
  }

  const lowerQuery = query.toLowerCase();
  const results = query
    ? Object.entries(searchIndex)
        .filter(([, entry]) => entry.text.toLowerCase().includes(lowerQuery))
        .sort(
          ([idA, entryA], [idB, entryB]) =>
            Number(entryB.ts ?? idB) - Number(entryA.ts ?? idA)
        )
        .slice(0, 100) // cap results for performance
        .map(([id, entry]) => {
          const chId = channelIdFromFile(entry.file);
          return { id, ...entry, channelId: chId, channelName: channelName(chId, channels) };
        })
    : [];

  return (
    <div id="messages">
      <div className="header">
        <h1>Search results</h1>
        <p className="search-query">
          {query ? `${results.length} result${results.length === 1 ? '' : 's'} for "${query}"` : 'Enter a search term'}
        </p>
      </div>

      <div className="search-results">
        {results.length === 0 && query && (
          <div className="search-empty">No messages matched your search.</div>
        )}
        <ul>
          {results.map((result) => {
            // Truncate text around the match for a snippet
            const matchIdx = result.text.toLowerCase().indexOf(lowerQuery);
            const snippetStart = Math.max(0, matchIdx - 60);
            const snippetEnd = Math.min(result.text.length, matchIdx + query.length + 60);
            const snippet =
              (snippetStart > 0 ? '...' : '') +
              result.text.slice(snippetStart, snippetEnd) +
              (snippetEnd < result.text.length ? '...' : '');

            return (
              <li key={result.id}>
                <Link to={
                  result.thread_ts
                    ? `/ws/${workspaceId}/c/${result.channelId}/t/${result.thread_ts}/m/${result.ts}`
                    : `/ws/${workspaceId}/c/${result.channelId}/m/${result.ts}`
                }>
                  <div className="search-result-channel">
                    #{result.channelName}
                    {result.thread_ts && <span className="search-result-thread"> · in thread</span>}
                  </div>
                  <div
                    className="search-result-text"
                    dangerouslySetInnerHTML={{ __html: highlightMatch(snippet, query) }}
                  />
                  <div className="search-result-meta">{formatTs(result.ts ?? result.id)}</div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
