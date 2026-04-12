# Stage 4: Frontend v2 — Deep Linking + Embedded Search

**Date:** 2026-04-12
**Branch:** `refactor/rebuild-plan`
**Prerequisite:** Stage 3 complete (shared `@slack-archive/types` package, pnpm workspace)

---

## 1. Goal

Implement the URL scheme from the rebuild plan (§7.2), add a thread view, and embed search — all while preserving the existing rendering components that already handle real Slack data correctly.

## 2. Approach: Refactor in Place

The current frontend has working, battle-tested components for message rendering (SlackText, Attachment, Files, Reaction, Avatar, Emoji) and data fetching (TanStack Query + axios). These stay. The router, layout shell, and page-level components are redesigned around them.

## 3. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rewrite vs. refactor | Refactor in place | Rendering components handle real Slack edge cases; rewriting means re-discovering them |
| Thread view | Dedicated route (not side panel) | Gives threads deep-linkable URLs without three-column layout complexity. Side panel can come later. |
| Search UI | Dedicated search page | Simplest implementation, gives results a URL (`/ws/:wsId/search?q=...`), fits two-column layout |
| Search bar location | Top of sidebar | Matches Slack convention, no extra layout region needed |
| Search implementation | Client-side filtering | Index is 14.8k entries / 4.5MB — small enough to load once and filter in-memory |
| Layout | Two-column (sidebar + main pane) | Same as current. No top bar, no third column for v1. |
| Workspace prefix | `/ws/default/` hardcoded for v1 | URL scheme is future-proofed but v1 is single-workspace |

## 4. URL Scheme

```
/                                                      → redirect to /ws/default/
/ws/:workspaceId                                       → redirect to first channel (or welcome page)
/ws/:workspaceId/c/:channelId                          → channel view
/ws/:workspaceId/c/:channelId/m/:messageTs             → channel anchored to message
/ws/:workspaceId/c/:channelId/t/:threadTs              → thread view
/ws/:workspaceId/c/:channelId/t/:threadTs/m/:messageTs → thread anchored to reply
/ws/:workspaceId/search?q=...                          → search results page
```

Slack timestamps (e.g. `1718745600.123456`) are URL-safe and serve as message identifiers throughout.

## 5. App Shell Layout

```
┌──────────────────────────────────────────────┐
│ ┌──────────┐ ┌─────────────────────────────┐ │
│ │ Sidebar   │ │ Main Pane                   │ │
│ │           │ │                             │ │
│ │ [🔍 Search]│ │ ┌─ Channel Header ───────┐ │ │
│ │           │ │ │ # channel-name          │ │ │
│ │ Public    │ │ └─────────────────────────┘ │ │
│ │  # general│ │                             │ │
│ │  # recipes│ │  Message list / Thread view  │ │
│ │           │ │  / Search results            │ │
│ │ Private   │ │                             │ │
│ │  # ...    │ │                             │ │
│ │           │ │                             │ │
│ │ DMs       │ │                             │ │
│ │  Carly    │ │                             │ │
│ └──────────┘ └─────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

The sidebar is persistent across all routes. The main pane renders the matched route's content (channel view, thread view, or search results).

## 6. Sub-Stages

### Stage 4A — Router + Layout Shell

Replace the flat route structure with the full URL scheme. Refactor the app shell so the sidebar and main pane work with nested routes.

**What changes:**
- `App.tsx`: new route tree with `/ws/:workspaceId/` prefix and nested routes
- `ChannelSidebar.tsx`: links change from `/channels/:id` to `/ws/:wsId/c/:id`
- `ChannelView.tsx`: reads `channelId` from new route params, removes hash-based anchoring
- New `WorkspaceLayout` component: reads `workspaceId` param, renders sidebar + outlet
- Root `/` redirects to `/ws/default/`

**What stays unchanged:**
- Message.tsx, SlackText.tsx, Attachment.tsx, Files.tsx, Reaction/, Avatar.tsx, Emoji.tsx
- api/slack.ts, utils/, styles/main.scss

**Exit criteria:** Navigating to `/ws/default/c/CL0AVQ3T3` renders the #general channel. Sidebar links work. Old `/channels/:id` routes no longer exist.

### Stage 4B — Thread View

Add a dedicated thread route that shows a parent message and its replies.

**What changes:**
- New `ThreadView` component at route `/ws/:wsId/c/:channelId/t/:threadTs`
- Shows parent message at top, replies listed below
- Back link/button to return to channel view
- `ChannelView` / `ParentMessage`: threaded messages show a "N replies" link instead of rendering replies inline
- Replies are stripped from the channel-level message list (they belong in the thread view)

**Data flow:** The backend already returns `ArchiveMessage[]` with `replies` inlined. `ThreadView` fetches the channel's messages, finds the parent by `threadTs`, and renders it with its `replies` array.

**Exit criteria:** Clicking "3 replies" on a threaded message navigates to `/ws/default/c/CL0AVQ3T3/t/1234567890.123456`. The thread view shows the parent and its replies. Back button returns to the channel.

### Stage 4C — Search

Add a search bar to the sidebar and a search results page.

**What changes:**
- New `SearchBar` component in the sidebar (above channel list)
- New `SearchResults` page component at route `/ws/:wsId/search?q=...`
- Search index loaded via `getSearchFile()` from `/api/search` (TanStack Query, long cache)
- Client-side filtering: case-insensitive substring match against the `text` field
- Results display: message text snippet (highlighted match), channel name, user name, timestamp
- Channel/user name resolution: cross-reference `file` field (e.g. `CL0AVQ3T3.json` → channel ID → channel name from channels query) and message `ts` → look up in messages if needed, or extend the search index to include `user` and `channel` fields

**Search index enrichment:** The current index shape is `Record<string, { text, file, ts }>`. It lacks user ID and channel name. Two options:
1. Enrich at query time in the frontend (derive channel ID from filename, look up name from channels query)
2. Extend the archiver to write `user` and `channelName` into the index

Option 1 is simpler for v1 — no archiver changes needed. The `file` field gives us the channel ID directly (`CL0AVQ3T3.json` → `CL0AVQ3T3`), and we already have channels and users loaded via TanStack Query.

**Exit criteria:** Typing "sourdough" in the search bar and pressing Enter navigates to `/ws/default/search?q=sourdough`. Results page shows matching messages with channel and timestamp context. Clicking a result navigates to the message in its channel.

### Stage 4D — Message Anchoring + Highlight

Make the `/m/:messageTs` route parameter scroll to and visually highlight the target message.

**What changes:**
- New `useMessageAnchor` hook: reads `messageTs` from route params, scrolls to the element with matching `id`, applies a highlight class
- Highlight CSS: brief background color pulse that fades out (replaces the current CSS `:target` approach which won't work with route params)
- Applied in both `ChannelView` and `ThreadView`
- Remove the old `useEffect` + `location.hash` scrolling from `ChannelView` and `Message`
- Remove the `handleTimestampClick` / `navigate` hash logic from `Message.tsx` — timestamps become `<Link>` elements to the `/m/:ts` route

**Exit criteria:** Navigating to `/ws/default/c/CL0AVQ3T3/m/1234567890.123456` scrolls to that message and highlights it with a brief visual pulse. Same works within thread view. Clicking a message timestamp produces a copyable deep link URL.

## 7. Data Dependencies

All data comes from existing backend endpoints — no backend changes needed for Stage 4:

| Endpoint | Used by | Data |
|----------|---------|------|
| `GET /api/channels` | Sidebar, search result enrichment | `Channel[]` |
| `GET /api/messages/:channelId` | ChannelView, ThreadView | `ArchiveMessage[]` |
| `GET /api/users` | Message rendering, search enrichment | `Users` |
| `GET /api/search` | SearchResults | `SearchIndex` |
| `GET /api/emoji` | Emoji rendering | `Emojis` |

## 8. Components Preserved (No Changes)

These components are carried forward as-is from the current frontend:

- `Message.tsx` — single message rendering (minor change: timestamp becomes a Link in 4D)
- `SlackText.tsx` — Slack markdown → React
- `Attachment.tsx` — rich embeds
- `Files.tsx` — file attachments
- `Reaction/Reaction.tsx` + `Reaction/Emoji.tsx` — reaction badges
- `Avatar.tsx` — user avatars
- `utils/emoji.ts` — Unicode emoji lookup
- `utils/users.ts` — user name resolution
- `utils/channels.ts` — channel categorization helpers
- `utils/timestamp.ts` — timestamp formatting

## 9. New Components

| Component | Route | Purpose |
|-----------|-------|---------|
| `WorkspaceLayout` | `/ws/:workspaceId` | Reads workspace param, renders sidebar + outlet |
| `ThreadView` | `/ws/:wsId/c/:channelId/t/:threadTs` | Parent message + replies list |
| `SearchBar` | (sidebar, not routed) | Text input, submits to search route |
| `SearchResults` | `/ws/:wsId/search?q=...` | Filtered results list with navigation |
| `useMessageAnchor` | (hook, used in ChannelView + ThreadView) | Scroll-to + highlight on route match |

## 10. What This Stage Does NOT Do

- No side-panel thread view (future enhancement)
- No server-side search or full-text search engine
- No multi-workspace support (URL scheme is ready, but v1 uses `default`)
- No pagination of channel messages (all messages load at once — acceptable for current data sizes, max ~11k in #general)
- No backend changes
- No styling redesign (existing SCSS carries forward)
