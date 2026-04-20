import { useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getChannels, getUsers } from '../api/slack';
import { Header } from './Header';
import { ParentMessage } from './ParentMessage';
import { useChannelMessages } from '../hooks/useChannelMessages';
import { useMessageAnchor } from '../hooks/useMessageAnchor';

export const ChannelView = () => {
  const { channelId, messageTs } = useParams();

  const {
    messages,
    isLoading,
    isLoadingOlder,
    isLoadingNewer,
    hasOlder,
    hasNewer,
    loadOlder,
    loadNewer,
  } = useChannelMessages();

  const { data: users = {} } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: getChannels
  });

  const channel = channels.find(c => c.id === channelId);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const hasInitiallyScrolledRef = useRef(false);
  const prevChannelRef = useRef<string | undefined>(undefined);

  // Reset initial scroll flag when channel changes
  useEffect(() => {
    if (prevChannelRef.current !== channelId) {
      prevChannelRef.current = channelId;
      hasInitiallyScrolledRef.current = false;
    }
  }, [channelId]);

  // Initial scroll position — bottom for newest page, or anchor for search
  useEffect(() => {
    if (isLoading || hasInitiallyScrolledRef.current) return;
    const container = scrollContainerRef.current;
    if (!container || messages.length === 0) return;

    hasInitiallyScrolledRef.current = true;

    if (!messageTs) {
      // No anchor — scroll to bottom (newest messages)
      container.scrollTop = container.scrollHeight;
    }
    // If messageTs exists, useMessageAnchor handles the scroll
  }, [isLoading, messages.length, messageTs]);

  useMessageAnchor(isLoading);

  // Preserve scroll position when older messages are prepended
  const handlePrependRef = useRef(false);

  // Before loading older, record current scrollHeight
  const wrappedLoadOlder = useCallback(async () => {
    const container = scrollContainerRef.current;
    if (container) {
      prevScrollHeightRef.current = container.scrollHeight;
      handlePrependRef.current = true;
    }
    await loadOlder();
  }, [loadOlder]);

  // After older messages prepend, adjust scrollTop
  useEffect(() => {
    if (!handlePrependRef.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    // Use requestAnimationFrame to wait for DOM update
    requestAnimationFrame(() => {
      const newScrollHeight = container.scrollHeight;
      const delta = newScrollHeight - prevScrollHeightRef.current;
      container.scrollTop += delta;
      handlePrependRef.current = false;
    });
  }, [messages]); // Triggers when messages array changes after prepend

  // IntersectionObserver for infinite scroll sentinels
  useEffect(() => {
    const container = scrollContainerRef.current;
    const topEl = topSentinelRef.current;
    const bottomEl = bottomSentinelRef.current;
    if (!container || !topEl || !bottomEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === topEl && hasOlder && !isLoadingOlder) {
            wrappedLoadOlder();
          } else if (entry.target === bottomEl && hasNewer && !isLoadingNewer) {
            loadNewer();
          }
        }
      },
      { root: container, rootMargin: '200px' }
    );

    observer.observe(topEl);
    observer.observe(bottomEl);

    return () => observer.disconnect();
  }, [hasOlder, hasNewer, isLoadingOlder, isLoadingNewer, wrappedLoadOlder, loadNewer]);

  if (!channel) {
    return <div id="messages">Channel not found</div>;
  }

  return (
    <div id="messages" ref={scrollContainerRef}>
      <Header channel={channel} users={users} />
      {isLoading && (
        <div className="loading">Loading messages...</div>
      )}

      <div className="messages-list">
        <div ref={topSentinelRef} className="scroll-sentinel" />
        {isLoadingOlder && (
          <div className="loading-indicator">Loading older messages...</div>
        )}

        {!isLoading && messages.length === 0 ? (
          <span>No messages were ever sent!</span>
        ) : (
          messages.map(message => (
            <ParentMessage
              key={message.ts}
              message={message}
              channelId={channelId!}
              users={users}
            />
          ))
        )}

        {isLoadingNewer && (
          <div className="loading-indicator">Loading newer messages...</div>
        )}
        <div ref={bottomSentinelRef} className="scroll-sentinel" />
      </div>
    </div>
  );
};
