# Stage 4 Testing Notes

Captured during manual smoke testing of `refactor/rebuild-plan` on 2026-04-12 after the 19-task Stage 4 implementation (frontend v2: routing, thread views, embedded search, message anchoring).

Stage 4 itself is complete and the basic flows work. The items below are issues found during smoke testing. None are Stage 4 blockers. One (search sort) will be folded into the Stage 4 wrap-up; the rest are deferred to later stages.

---

## 1. Slack CDN URL rewriting is incomplete

**Severity:** medium — cosmetic/loading noise, not a functional break
**Deferred to:** its own follow-up stage (likely Stage 4.5 or bundled into Stage 6 asset pipeline)

During channel rendering, the browser fires a flood of 301/302 redirects against `files.slack.com`, `avatars.slack-edge.com`, `a.slack-edge.com`, and similar hosts. These URLs are embedded in raw message text, attachment `image_url`/`thumb_url` fields, and possibly avatar/reaction/emoji paths. They require signed params that expire and get rotated when Slack reorganizes storage, so they 301 through several hops before eventually 404ing.

**Why this matters:** the whole point of the legacy archiver downloading files, avatars, and emoji to disk was to make the archive self-contained and cold-storage durable. The new backend already mounts `DATA_DIR` under `/static` (`backend/src/server.ts:18`), and `frontend/src/api/slack.ts` has `getFileUrl` and `getEmojiUrl` helpers — but not every consumer routes through them. Anything that passes through raw `message.text` or attachment `*_url` fields still points at `slack.com`.

**Fix sketch:** grep the frontend components that consume `message.text`, `Attachment.*_url`, file/avatar/emoji fields, and route all Slack CDN URLs through the backend's `/static` mount. Coordinate with the archiver to confirm what's actually on disk for each URL type.

---

## 2. Search result sort order (channel-first instead of date-first)

**Severity:** low — UX annoyance
**Deferred to:** folded into Stage 4 wrap-up as a 1-line fix

`frontend/src/components/SearchResults.tsx` currently returns results in whatever order `Object.entries(searchIndex)` yields. Because the search index is keyed/ordered per-channel file, this effectively groups results by channel: if "general" and "todo" both match, the user sees all general hits first, then all todo hits, rather than interleaved by recency.

**Desired behavior:** sort strictly by message `ts` descending (newest first) across all channels. Channel identity is still shown per-result but should not influence order.

**Fix:** add `.sort((a, b) => Number(b.ts ?? 0) - Number(a.ts ?? 0))` after the filter, before `.slice(0, 100)`. Note that `entry.ts` is optional in `SearchIndexSchema` — handle missing ts by pushing to the end.

---

## 3. Channel load performance — slow jump to search result in large channels

**Severity:** high (UX) — noticeable multi-second delay on large channels
**Deferred to:** its own follow-up stage, coupled with issue #4

Clicking a search result link (`/ws/:ws/c/:channelId/m/:ts`) currently:

1. Triggers `getMessages(channelId)` — fetches the channel's entire JSON blob via `/api/messages/:channelId`
2. React Query caches it
3. `useMessageAnchor` waits for `isLoading=false`, then scrolls to `#ts`

For channels with thousands of messages, step 1 dominates. There's no windowing, pagination, range request, or skeleton UI — the user stares at a blank/loading channel until the whole array lands and React renders every message node.

**Options to consider (not yet decided):**

- **Virtualization** (react-virtuoso / react-window) so DOM cost is bounded regardless of channel size.
- **Range-aware API**: `GET /api/messages/:channelId?around=:ts&limit=N` returning a slice centered on the target `ts`, backed by a server-side index (probably a sidecar `.index.json` per channel mapping `ts` → byte offset, or in-memory sorting).
- **Skeleton loading** with an immediate scroll-target placeholder while the full payload streams in.
- **Pagination** with "load older/newer" buttons at the edges.

**Coordinate with:** issue #4 below — any solution touches the same infrastructure.

---

## 4. Channel message render order

**Severity:** low (UX preference) — design choice, not a bug
**Deferred to:** bundled with issue #3

Dan's preference: render oldest → newest top-down (matches how Slack itself displays a channel so reading flows naturally), then on initial paint scroll the viewport to the **bottom** so the user lands on the most recent message.

**Complication:** auto-scrolling to the bottom while thousands of messages + attachments + images are still painting is non-trivial — late-loading assets shift layout upward and fight the scroll anchor. This couples directly with issue #3: if we virtualize, we can jump to the tail instantly without waiting for all nodes; if we range-load around a target ts, initial load = "around newest" slice.

**Check before fixing:** verify the current sort direction in `archive/` write path and `backend/` read path before assuming the frontend needs to reverse anything.

---

## Summary

| # | Item | Severity | Disposition |
|---|------|----------|-------------|
| 1 | Slack CDN URL rewriting | medium | Deferred — own stage |
| 2 | Search sort order | low | Folded into Stage 4 wrap-up |
| 3 | Channel load perf | high UX | Deferred — own stage, coupled with #4 |
| 4 | Channel message order | low | Deferred — bundled with #3 |
