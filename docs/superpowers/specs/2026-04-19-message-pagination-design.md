# Message Pagination Design

## Problem

The app loads all messages for a channel in a single request. Channels with thousands of messages cause slow loads, heavy rendering, and high memory usage.

## Solution

Cursor-based pagination using message timestamps (`ts`) as cursors, with a sliding window of rendered messages on the frontend.

## Backend API

### Endpoint

`GET /api/messages/:channelId`

Query parameters:

| Param | Type | Description |
|-------|------|-------------|
| `before` | string (ts) | Return messages older than this timestamp |
| `after` | string (ts) | Return messages newer than this timestamp |
| `around` | string (ts) | Return messages centered on this timestamp |
| `limit` | number | Page size, default 250 |

Rules:
- No cursor params: return the newest `limit` messages.
- `before=<ts>`: return `limit` messages older than `ts` (scrolling up).
- `after=<ts>`: return `limit` messages newer than `ts` (scrolling down).
- `around=<ts>`: return `limit` messages centered on `ts` (~half before, ~half after). Used for search result anchoring.
- `before`, `after`, and `around` are mutually exclusive.

### Response Shape

```ts
{
  messages: ArchiveMessage[],
  hasOlder: boolean,
  hasNewer: boolean,
  oldestTs: string,
  newestTs: string
}
```

The server loads the full cached message array, finds the cursor position, slices, and returns.

## Shared Types

Add to `packages/types/`:

```ts
interface PaginatedMessages {
  messages: ArchiveMessage[];
  hasOlder: boolean;
  hasNewer: boolean;
  oldestTs: string;
  newestTs: string;
}
```

## Frontend Data Layer

### `useChannelMessages` Hook (new file)

Replaces the single `useQuery` in `ChannelView`. Manages a window of loaded pages.

State:
- `pages`: ordered list of loaded page results (each with messages and cursor metadata).
- `allMessages`: flattened, deduplicated, sorted array derived from `pages` — what gets rendered.
- `isLoadingOlder` / `isLoadingNewer`: per-direction loading states.
- `initialCursor`: `undefined` (load newest) or a `ts` value (from route param).

Behaviors:
- **Initial load**: If `messageTs` route param exists, fetch with `around=<messageTs>`. Otherwise, fetch with no cursor (newest page).
- **Load older**: `getMessages(channelId, { before: oldestTs })`. Prepend page.
- **Load newer**: `getMessages(channelId, { after: newestTs })`. Append page.
- **Trimming**: After adding a page, if total messages exceed ~1000, drop pages from the opposite end. A trimmed end resets its `hasMore` flag to `true`.

Exposes: `{ messages, isLoading, isLoadingOlder, isLoadingNewer, hasOlder, hasNewer, loadOlder, loadNewer }`

### API Client

`getMessages` in `slack.ts` gains optional cursor params and returns `PaginatedMessages`.

## Frontend Scroll Behavior

### Scroll Container

`.messages-list` becomes the scroll container (overflow-y, fixed height within layout).

### Scroll Triggers

Two sentinel elements (top and bottom of the list) observed via `IntersectionObserver`:
- Top sentinel visible + `hasOlder`: call `loadOlder()`.
- Bottom sentinel visible + `hasNewer`: call `loadNewer()`.

### Scroll Position Preservation

- **Prepending older messages**: Measure `scrollHeight` before prepend, adjust `scrollTop` by delta after render.
- **Appending newer messages**: No adjustment needed.
- **Trimming distant pages**: Same measure-and-adjust logic if trimmed content was above viewport.

### Initial Scroll Position

- No anchor (newest page): scroll to bottom after initial render.
- Search anchor (`around=<ts>`): `scrollIntoView` the target message element with highlight.

### Loading Indicators

- Spinner at top of list when `isLoadingOlder`.
- Spinner at bottom when `isLoadingNewer`.
- Full-page "Loading messages..." for initial load.

## Search Anchor Integration

- `useChannelMessages` reads `messageTs` from route params. If present, uses `around=<messageTs>` for initial fetch.
- `useMessageAnchor` continues to work as-is — waits for loading, finds element by ID, scrolls with highlight.
- If anchored `ts` doesn't exist, `around` returns the nearest page; highlight is a no-op.

## File Changes

| File | Change |
|------|--------|
| `backend/src/server.ts` | Parse query params, slice cached array, return new response shape |
| `backend/src/utils/data-load.ts` | New helper to slice by cursor/limit and compute `hasOlder`/`hasNewer` |
| `packages/types/` | Add `PaginatedMessages` type |
| `frontend/src/api/slack.ts` | Add cursor params, change return type to `PaginatedMessages` |
| `frontend/src/hooks/useChannelMessages.ts` | New file: pagination/window management hook |
| `frontend/src/components/ChannelView.tsx` | Use `useChannelMessages`, add sentinels and spinners, scroll container |
| `frontend/src/hooks/useMessageAnchor.ts` | Adjust to work with new loading state |

No new dependencies. `IntersectionObserver` is a browser API.

## What Doesn't Change

`ParentMessage`, `Message`, `ThreadView`, `SearchResults`, `SearchBar`, the archiver, data files on disk.
