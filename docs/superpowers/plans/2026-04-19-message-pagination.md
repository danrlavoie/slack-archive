# Message Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-channel message loading with cursor-based pagination and a sliding window on the frontend.

**Architecture:** Backend slices its cached message array by timestamp cursor and returns a page with boundary metadata. Frontend manages a window of pages via a custom hook, using IntersectionObserver sentinels for infinite scroll and scroll-position preservation for prepends.

**Tech Stack:** Express (backend), React 19 + TanStack Query (frontend), Zod (shared types), Vitest (backend tests)

---

### Task 1: Add `PaginatedMessages` type to shared types

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add the PaginatedMessages interface**

At the end of `packages/types/src/index.ts`, add:

```ts
/** Paginated response for channel messages. */
export interface PaginatedMessages {
  messages: ArchiveMessage[];
  hasOlder: boolean;
  hasNewer: boolean;
  oldestTs: string;
  newestTs: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add PaginatedMessages interface"
```

---

### Task 2: Add backend pagination utility with tests

**Files:**
- Create: `backend/src/utils/paginate.ts`
- Create: `backend/src/utils/__tests__/paginate.test.ts`
- Modify: `backend/package.json` (add vitest)

The archiver writes messages newest-first (descending `ts`), but `merge-channels` writes oldest-first (ascending). The pagination utility must normalize to ascending order (oldest first) before slicing, since the frontend renders oldest at top and newest at bottom.

- [ ] **Step 1: Add vitest to backend**

```bash
cd backend && pnpm add -D vitest
```

Add to `backend/package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Write failing tests for `paginateMessages`**

Create `backend/src/utils/__tests__/paginate.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { paginateMessages } from '../paginate.js';
import type { ArchiveMessage } from '@slack-archive/types';

function makeMessages(count: number): ArchiveMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    ts: `${1000 + i}.000000`,
    type: 'message',
    text: `msg-${i}`,
  })) as ArchiveMessage[];
}

// Input may be in any order — utility must normalize to ascending
function reversed(msgs: ArchiveMessage[]): ArchiveMessage[] {
  return [...msgs].reverse();
}

describe('paginateMessages', () => {
  const msgs = makeMessages(20); // ts: 1000..1019, ascending

  test('no cursor returns newest `limit` messages', () => {
    const result = paginateMessages(msgs, {}, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1015.000000', '1016.000000', '1017.000000', '1018.000000', '1019.000000',
    ]);
    expect(result.hasOlder).toBe(true);
    expect(result.hasNewer).toBe(false);
    expect(result.oldestTs).toBe('1015.000000');
    expect(result.newestTs).toBe('1019.000000');
  });

  test('no cursor with descending input normalizes to ascending', () => {
    const result = paginateMessages(reversed(msgs), {}, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1015.000000', '1016.000000', '1017.000000', '1018.000000', '1019.000000',
    ]);
  });

  test('before cursor returns messages older than ts', () => {
    const result = paginateMessages(msgs, { before: '1010.000000' }, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1005.000000', '1006.000000', '1007.000000', '1008.000000', '1009.000000',
    ]);
    expect(result.hasOlder).toBe(true);
    expect(result.hasNewer).toBe(true);
  });

  test('before cursor near start sets hasOlder false', () => {
    const result = paginateMessages(msgs, { before: '1003.000000' }, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1000.000000', '1001.000000', '1002.000000',
    ]);
    expect(result.hasOlder).toBe(false);
    expect(result.hasNewer).toBe(true);
  });

  test('after cursor returns messages newer than ts', () => {
    const result = paginateMessages(msgs, { after: '1010.000000' }, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1011.000000', '1012.000000', '1013.000000', '1014.000000', '1015.000000',
    ]);
    expect(result.hasOlder).toBe(true);
    expect(result.hasNewer).toBe(true);
  });

  test('after cursor near end sets hasNewer false', () => {
    const result = paginateMessages(msgs, { after: '1016.000000' }, 5);
    expect(result.messages.map(m => m.ts)).toEqual([
      '1017.000000', '1018.000000', '1019.000000',
    ]);
    expect(result.hasOlder).toBe(true);
    expect(result.hasNewer).toBe(false);
  });

  test('around cursor centers on the target ts', () => {
    const result = paginateMessages(msgs, { around: '1010.000000' }, 6);
    // 6 messages centered on index 10: 3 before + target + 2 after = indices 7..12
    expect(result.messages.map(m => m.ts)).toEqual([
      '1007.000000', '1008.000000', '1009.000000',
      '1010.000000',
      '1011.000000', '1012.000000',
    ]);
    expect(result.hasOlder).toBe(true);
    expect(result.hasNewer).toBe(true);
  });

  test('around with ts not in array uses nearest position', () => {
    const result = paginateMessages(msgs, { around: '1010.500000' }, 4);
    // 1010.5 falls between index 10 and 11; insertion point is 11
    // center around 11: 2 before + 2 at/after = indices 9..12
    expect(result.messages.map(m => m.ts)).toEqual([
      '1009.000000', '1010.000000', '1011.000000', '1012.000000',
    ]);
  });

  test('empty messages array returns empty result', () => {
    const result = paginateMessages([], {}, 5);
    expect(result.messages).toEqual([]);
    expect(result.hasOlder).toBe(false);
    expect(result.hasNewer).toBe(false);
    expect(result.oldestTs).toBe('');
    expect(result.newestTs).toBe('');
  });

  test('limit larger than total returns all messages', () => {
    const result = paginateMessages(msgs, {}, 100);
    expect(result.messages.length).toBe(20);
    expect(result.hasOlder).toBe(false);
    expect(result.hasNewer).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && pnpm test`
Expected: FAIL — `paginate.ts` does not exist

- [ ] **Step 4: Implement `paginateMessages`**

Create `backend/src/utils/paginate.ts`:

```ts
import type { ArchiveMessage, PaginatedMessages } from '@slack-archive/types';

interface CursorParams {
  before?: string;
  after?: string;
  around?: string;
}

function ensureAscending(messages: ArchiveMessage[]): ArchiveMessage[] {
  if (messages.length < 2) return messages;
  const first = parseFloat(messages[0].ts || '0');
  const last = parseFloat(messages[messages.length - 1].ts || '0');
  if (first > last) {
    return [...messages].reverse();
  }
  return messages;
}

function findInsertionIndex(messages: ArchiveMessage[], ts: string): number {
  const target = parseFloat(ts);
  let lo = 0;
  let hi = messages.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (parseFloat(messages[mid].ts || '0') < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export function paginateMessages(
  rawMessages: ArchiveMessage[],
  cursor: CursorParams,
  limit: number,
): PaginatedMessages {
  const messages = ensureAscending(rawMessages);

  if (messages.length === 0) {
    return { messages: [], hasOlder: false, hasNewer: false, oldestTs: '', newestTs: '' };
  }

  let start: number;
  let end: number;

  if (cursor.around) {
    const idx = findInsertionIndex(messages, cursor.around);
    const half = Math.floor(limit / 2);
    start = Math.max(0, idx - half);
    end = Math.min(messages.length, start + limit);
    // Re-adjust start if we hit the end boundary
    start = Math.max(0, end - limit);
  } else if (cursor.before) {
    const idx = findInsertionIndex(messages, cursor.before);
    end = idx; // exclusive — don't include the cursor message
    start = Math.max(0, end - limit);
  } else if (cursor.after) {
    const idx = findInsertionIndex(messages, cursor.after);
    // Skip past any message with exactly this ts
    start = idx < messages.length && messages[idx].ts === cursor.after ? idx + 1 : idx;
    end = Math.min(messages.length, start + limit);
  } else {
    // No cursor — newest page
    end = messages.length;
    start = Math.max(0, end - limit);
  }

  const page = messages.slice(start, end);

  return {
    messages: page,
    hasOlder: start > 0,
    hasNewer: end < messages.length,
    oldestTs: page.length > 0 ? page[0].ts || '' : '',
    newestTs: page.length > 0 ? page[page.length - 1].ts || '' : '',
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pnpm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/utils/paginate.ts backend/src/utils/__tests__/paginate.test.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "feat(backend): add paginateMessages utility with tests"
```

---

### Task 3: Wire pagination into the Express endpoint

**Files:**
- Modify: `backend/src/server.ts:32-39`

- [ ] **Step 1: Update the messages endpoint to parse query params and use `paginateMessages`**

Replace the existing `/api/messages/:channelId` handler in `backend/src/server.ts` (lines 32-39):

```ts
app.get('/api/messages/:channelId', async (req, res) => {
  try {
    const messages = await getMessages(req.params.channelId);
    const { before, after, around } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 250, 1), 1000);
    const result = paginateMessages(messages, { before, after, around }, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});
```

Add the import at the top of `server.ts`:

```ts
import { paginateMessages } from './utils/paginate.js';
```

- [ ] **Step 2: Verify backend starts and endpoint responds**

Run: `cd backend && pnpm dev &`
Then: `curl 'http://localhost:3100/api/messages/<any-channel-id>?limit=3' | head -c 500`
Expected: JSON with `messages`, `hasOlder`, `hasNewer`, `oldestTs`, `newestTs` fields

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat(backend): wire pagination into messages endpoint"
```

---

### Task 4: Update frontend API client

**Files:**
- Modify: `frontend/src/api/slack.ts`

- [ ] **Step 1: Update `getMessages` to accept cursor params and return `PaginatedMessages`**

Replace the entire contents of `frontend/src/api/slack.ts`:

```ts
import axios from 'axios';
import type { ArchiveMessage, Channel, Users, Emojis, SearchIndex, PaginatedMessages } from '@slack-archive/types';

const api = axios.create({
  baseURL: '/api'
});

export interface MessageCursorParams {
  before?: string;
  after?: string;
  around?: string;
  limit?: number;
}

export const getChannels = async (): Promise<Channel[]> => {
  const { data } = await api.get('/channels');
  return data;
};

export const getMessages = async (
  channelId: string,
  cursor?: MessageCursorParams,
): Promise<PaginatedMessages> => {
  const { data } = await api.get(`/messages/${channelId}`, {
    params: cursor,
  });
  return data;
};

export const getUsers = async (): Promise<Users> => {
  const { data } = await api.get('/users');
  return data;
};

export const getEmoji = async (): Promise<Emojis> => {
  const { data } = await api.get('/emoji');
  return data;
};

export const getFileUrl = (channelId: string, fileId: string, fileType: string): string => {
  return `/static/files/${channelId}/${fileId}.${fileType}`;
};

export const getEmojiUrl = (name: string): string => {
  return `/api/emoji/${name}`;
};

export const getSearchIndex = async (): Promise<SearchIndex> => {
  const { data } = await api.get('/search');
  return data;
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/slack.ts
git commit -m "feat(frontend): update getMessages API to accept cursor params"
```

---

### Task 5: Create the `useChannelMessages` hook

**Files:**
- Create: `frontend/src/hooks/useChannelMessages.ts`

This is the core of the frontend pagination logic. It manages multiple pages, flattens them into a single message array, exposes load functions, and trims when the total exceeds the max window size.

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useChannelMessages.ts`:

```ts
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getMessages } from '../api/slack';
import type { PaginatedMessages } from '@slack-archive/types';
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useChannelMessages.ts
git commit -m "feat(frontend): add useChannelMessages pagination hook"
```

---

### Task 6: Update `ChannelView` to use paginated messages with scroll behavior

**Files:**
- Modify: `frontend/src/components/ChannelView.tsx`
- Modify: `frontend/src/hooks/useMessageAnchor.ts`
- Modify: `frontend/src/styles/main.scss`

- [ ] **Step 1: Rewrite `ChannelView` with sentinels and scroll management**

Replace the entire contents of `frontend/src/components/ChannelView.tsx`:

```tsx
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
```

- [ ] **Step 2: Add styles for loading indicators and scroll sentinel**

Add to the end of `frontend/src/styles/main.scss` (before the closing of the file):

```scss
.scroll-sentinel {
  height: 1px;
}

.loading-indicator {
  text-align: center;
  padding: 12px;
  color: #616061;
  font-size: 13px;
}
```

- [ ] **Step 3: Update `#messages` styles to be the scroll container**

In `frontend/src/styles/main.scss`, the `#messages` block already has `overflow: scroll` and `height: 100%`, so it is already the scroll container. The `Header` uses `position: sticky; top: 0` which works inside a scrolling container. No CSS changes needed here.

- [ ] **Step 4: Update `useMessageAnchor` to handle edge case**

The current `useMessageAnchor` hook works as-is — it waits for `isLoading` to be false, then finds the element by ID and scrolls to it. No changes needed since `isLoading` from `useChannelMessages` serves the same purpose as the old `messagesLoading`.

- [ ] **Step 5: Verify the app works end-to-end**

Start both backend and frontend dev servers:

```bash
cd backend && pnpm dev &
cd frontend && pnpm dev &
```

Test in browser:
1. Navigate to a channel — should load newest 250 messages, scrolled to bottom
2. Scroll up — should trigger loading older messages with scroll position preserved
3. Navigate to a channel via search result with `messageTs` — should load page around that message and highlight it
4. Scroll past 1000 messages — pages on the far end should be trimmed

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ChannelView.tsx frontend/src/styles/main.scss
git commit -m "feat(frontend): paginated channel view with infinite scroll"
```

---

### Task 7: Final integration test and cleanup

**Files:** None new — verification only

- [ ] **Step 1: Run backend tests**

```bash
cd backend && pnpm test
```

Expected: All pagination tests pass.

- [ ] **Step 2: Build all packages to verify no type errors**

```bash
cd packages/types && pnpm build
cd backend && pnpm build
cd frontend && pnpm build
```

Expected: Clean builds with no errors.

- [ ] **Step 3: Browser verification**

Test the full flow:
1. Open a channel with many messages — initial load should be fast, show newest ~250 messages
2. Scroll up — older messages load, scroll position stays stable
3. Keep scrolling up past 1000 messages — newest messages get trimmed
4. Scroll back down — trimmed messages reload
5. Click a search result — loads the page containing that message, highlights it
6. Switch channels — resets to newest page of new channel

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address integration issues from pagination testing"
```
