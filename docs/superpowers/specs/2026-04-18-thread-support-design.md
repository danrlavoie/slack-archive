# Thread Support Design

## Goal

Enable the slack-archive webapp to display threaded conversations — showing thread indicators on parent messages in the channel view, rendering full thread contents in a dedicated thread view, supporting deep-links to individual replies, and including reply text in search results.

## Current State

Significant thread infrastructure already exists but is non-functional due to a data persistence bug:

- **Types**: `ArchiveMessage` extends `MessageElement` with `replies?: Array<MessageElement>` (`packages/types/src/index.ts`)
- **Archiver**: Downloads replies via Slack's `conversations.replies` API (`archive/src/slack.ts:424-454`), but `writeChannelData()` is called *before* `downloadExtras()` populates the `replies` field (`archive/src/cli.ts:127` vs `135`). Result: zero messages in the dataset have a `replies` array.
- **Frontend**: `ThreadView` component, `ParentMessage` with thread links, URL routes (`/c/:cid/t/:threadTs` and `/c/:cid/t/:threadTs/m/:messageTs`), and `useMessageAnchor` hook for scroll+highlight all exist.
- **Backend**: No changes needed — serves whatever is in the JSON via `/api/messages/:channelId`.
- **Search**: Indexes only top-level messages; reply text is not searchable.
- **Legacy data**: The pre-2026 legacy dataset at `/home/danlavoie/Documents/slack-archive/slack-archive` contains 182 messages with populated `replies` arrays. These were lost during the merge because the new archiver never persisted replies. Re-merging after the fix can recover them (separate follow-up).

## Architecture

No new backend endpoints or components. The fix is a write-ordering change in the archiver, a search indexer extension, and three small frontend enhancements to existing components.

Data flow:
1. Archiver downloads messages, then downloads replies, then writes a single JSON file per channel with replies embedded in parent messages.
2. Backend serves the JSON as-is via the existing `/api/messages/:channelId` endpoint.
3. Frontend reads `replies[]` from each message and renders thread UI.

## Changes

### 1. Archiver Write Ordering Fix

**File:** `archive/src/cli.ts`

Move `writeChannelData(channel.id, sortedUniqueResult)` from before `downloadExtras()` to after it. The flow becomes:

1. `downloadMessages()` — fetch messages from Slack
2. `downloadExtras()` — fetch replies and users (mutates `message.replies` in place)
3. `writeChannelData()` — single atomic write with replies included
4. `downloadFilesForChannel()` — fetch files (reads from disk, must come after write)

This ensures replies are persisted to JSON. The dedup/sort on `sortedUniqueResult` still happens before the write.

### 2. Search Index Extension

**File:** `archive/src/search.ts`

Extend `createSearchIndex()` to index reply text:

- After indexing a top-level message, iterate `msg.replies[]` if present.
- Each reply gets its own entry in the search index, keyed by its `ts`.
- Index entries gain a new optional `thread_ts` field — set to the parent message's `ts` for replies, absent for top-level messages.
- The `file` field remains the same channel JSON filename.

**File:** `packages/types/src/index.ts`

Add optional `thread_ts?: string` to the `SearchIndexSchema` entry shape.

### 3. Frontend: Thread Indicator Enhancement

**File:** `frontend/src/components/ParentMessage.tsx`

The thread link currently shows only "N replies". Enhance to show "N replies · 3 days ago" using the `latest_reply` field from Slack message metadata (already present in the data as a Unix timestamp string).

Add a small relative-date formatting helper (e.g., "2 hours ago", "yesterday", "3 days ago", "Mar 15").

### 4. Frontend: Reply Anchoring

**File:** `frontend/src/components/ThreadView.tsx`

Add `id={reply.ts}` to each reply's wrapper `<div>`. The existing `useMessageAnchor` hook reads `messageTs` from URL params and scrolls to the element with that ID + applies `message-highlight` — no hook changes needed.

### 5. Frontend: Search Result Links for Replies

**File:** `frontend/src/components/SearchResults.tsx`

When rendering search results, check for `thread_ts` on each result entry:
- If `thread_ts` is present: link to `/ws/:wid/c/:cid/t/:threadTs/m/:replyTs`
- If absent: link to `/ws/:wid/c/:cid/m/:ts` (current behavior, unchanged)

## Testing

### Automated (Vitest)

- **Archiver write ordering**: Mock Slack API calls, run the archival flow, assert the written JSON contains `replies` arrays on thread-parent messages.
- **Search indexer**: Feed a mock message array (with replies) to `createSearchIndex`, assert reply text appears in the index with correct `thread_ts` field.

### Manual Smoke Test

- Start dev server against data containing replies.
- Verify thread indicator shows count + relative date in channel view.
- Click thread link — navigates to thread view with parent + separator + replies.
- Direct-link to a reply within a thread — scrolls to and highlights that reply.
- Search for text that appears only in a reply — result links into thread view at the correct message.

## Out of Scope

- **Re-archiving and re-merging**: After this ships, re-run the archiver to populate reply data, then re-merge with the legacy dataset to recover 182 threads. Separate follow-up task.
- **Side panel thread view**: Current implementation uses full-page navigation with a "Back to #channel" link. Side panel is a potential future enhancement.
- **Participant avatars in thread indicators**: Thread link uses text-only minimal format ("N replies · time ago").
- **CDN URL rewriting in thread replies**: Deferred past this work (tracked separately).
