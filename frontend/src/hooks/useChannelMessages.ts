import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getMessages } from '../api/slack';
import type { ArchiveMessage } from '@slack-archive/types';

const PAGE_SIZE = 250;
const MAX_MESSAGES = 1000;

interface Page {
  messages: ArchiveMessage[];
  hasOlder: boolean;
  hasNewer: boolean;
  oldestTs: string;
  newestTs: string;
}

export function useChannelMessages() {
  const { channelId, messageTs } = useParams();
  const [pages, setPages] = useState<Page[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isLoadingNewer, setIsLoadingNewer] = useState(false);
  const loadingRef = useRef(false);
  const currentChannelRef = useRef<string | undefined>(undefined);

  // Flatten pages into a single sorted, deduplicated message array
  const messages = useMemo(() => {
    const seen = new Set<string>();
    const all: ArchiveMessage[] = [];
    for (const page of pages) {
      for (const msg of page.messages) {
        if (msg.ts && !seen.has(msg.ts)) {
          seen.add(msg.ts);
          all.push(msg);
        }
      }
    }
    all.sort((a, b) => parseFloat(a.ts || '0') - parseFloat(b.ts || '0'));
    return all;
  }, [pages]);

  const hasOlder = pages.length > 0 ? pages[0].hasOlder : false;
  const hasNewer = pages.length > 0 ? pages[pages.length - 1].hasNewer : false;

  // Initial load — fetch newest page or page around anchor
  useEffect(() => {
    if (!channelId) return;

    // Reset when channel changes
    if (currentChannelRef.current !== channelId) {
      currentChannelRef.current = channelId;
      setPages([]);
      setIsLoading(true);
    }

    let cancelled = false;

    async function load() {
      const cursor = messageTs ? { around: messageTs, limit: PAGE_SIZE } : { limit: PAGE_SIZE };
      const result = await getMessages(channelId!, cursor);
      if (!cancelled) {
        setPages([result]);
        setIsLoading(false);
      }
    }

    load();

    return () => { cancelled = true; };
  }, [channelId, messageTs]);

  const loadOlder = useCallback(async () => {
    if (!channelId || loadingRef.current || pages.length === 0 || !pages[0].hasOlder) return;
    loadingRef.current = true;
    setIsLoadingOlder(true);

    try {
      const oldestTs = pages[0].oldestTs;
      const result = await getMessages(channelId, { before: oldestTs, limit: PAGE_SIZE });
      setPages(prev => {
        const next = [result, ...prev];
        return trimPages(next, 'older');
      });
    } finally {
      loadingRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [channelId, pages]);

  const loadNewer = useCallback(async () => {
    if (!channelId || loadingRef.current || pages.length === 0 || !pages[pages.length - 1].hasNewer) return;
    loadingRef.current = true;
    setIsLoadingNewer(true);

    try {
      const newestTs = pages[pages.length - 1].newestTs;
      const result = await getMessages(channelId, { after: newestTs, limit: PAGE_SIZE });
      setPages(prev => {
        const next = [...prev, result];
        return trimPages(next, 'newer');
      });
    } finally {
      loadingRef.current = false;
      setIsLoadingNewer(false);
    }
  }, [channelId, pages]);

  return {
    messages,
    isLoading,
    isLoadingOlder,
    isLoadingNewer,
    hasOlder,
    hasNewer,
    loadOlder,
    loadNewer,
  };
}

/**
 * If total messages across all pages exceed MAX_MESSAGES,
 * drop pages from the opposite end of the scroll direction.
 * Mark the trimmed end as hasOlder/hasNewer = true since we
 * discarded data that can be re-fetched.
 */
function trimPages(pages: Page[], direction: 'older' | 'newer'): Page[] {
  let total = pages.reduce((sum, p) => sum + p.messages.length, 0);

  if (total <= MAX_MESSAGES) return pages;

  const result = [...pages];

  if (direction === 'older') {
    // Scrolling up — trim from the newest end (end of array)
    while (result.length > 1 && total > MAX_MESSAGES) {
      const removed = result.pop()!;
      total -= removed.messages.length;
    }
    // Mark the new last page as having newer messages
    if (result.length > 0) {
      result[result.length - 1] = { ...result[result.length - 1], hasNewer: true };
    }
  } else {
    // Scrolling down — trim from the oldest end (start of array)
    while (result.length > 1 && total > MAX_MESSAGES) {
      const removed = result.shift()!;
      total -= removed.messages.length;
    }
    // Mark the new first page as having older messages
    if (result.length > 0) {
      result[0] = { ...result[0], hasOlder: true };
    }
  }

  return result;
}
