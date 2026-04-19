# Thread Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the archiver so thread replies are persisted to JSON, extend search to index reply text, and enhance the frontend thread indicator to show the last-reply date.

**Architecture:** The archiver already downloads replies but writes messages to disk before populating them. Moving the write after `downloadExtras()` fixes persistence. The search indexer gains a loop over `msg.replies[]` with a new `thread_ts` field. The frontend `ParentMessage` component adds a relative date to its thread link, and `SearchResults` uses `thread_ts` to link into thread views.

**Tech Stack:** TypeScript 5.8, Vitest, pnpm workspace, React 19, Zod

---

### Task 1: Fix archiver write ordering

**Files:**
- Modify: `archive/src/cli.ts:117-141`

The archiver calls `writeChannelData()` at line 127 before `downloadExtras()` at line 135. Replies are fetched into memory but never written to disk. Move the write to after `downloadExtras()` but before `downloadFilesForChannel()` (which reads from disk and needs replies present).

- [ ] **Step 1: Move `writeChannelData` after `downloadExtras`**

In `archive/src/cli.ts`, replace lines 122-140 (the section from `const result` through `downloadFilesForChannel`) with this reordered version:

```typescript
      const result = downloadData.messages;
      const sortedUniqueResult = uniqBy(result, "ts").sort((a, b) => {
        return parseFloat(b.ts || "0") - parseFloat(a.ts || "0");
      });
      const { is_archived, is_im, is_user_deleted } = channel;
      if (is_archived || (is_im && is_user_deleted)) {
        channelsAndAuth.channels[channel.id].fullyDownloaded = true;
      }
      channelsAndAuth.channels[channel.id].messages = result.length;

      // Download extra content (threads, users) — mutates message.replies in place
      await downloadExtras(channel, sortedUniqueResult, users);
      await downloadEmojis(sortedUniqueResult, emojis);
      await downloadAvatars();

      // Write the channel message data to disk (after replies are populated)
      writeChannelData(channel.id, sortedUniqueResult);

      // Download files. This needs to run after the messages are saved to disk
      // since it uses the message data to find which files to download.
      await downloadFilesForChannel(channel.id);
```

Key changes:
- `writeChannelData` moved from before `downloadExtras` to after it
- `downloadExtras` now receives `sortedUniqueResult` instead of `result` — this ensures the deduped/sorted array is the one that gets replies attached and written
- Same for `downloadEmojis`
- The comment on `downloadFilesForChannel` is preserved — it still reads from disk and must come after the write

- [ ] **Step 2: Verify the archive package builds**

Run: `cd archive && pnpm build`
Expected: Clean compilation, no errors

- [ ] **Step 3: Commit**

```bash
git add archive/src/cli.ts
git commit -m "fix(archiver): write channel data after downloading thread replies

The write was happening before downloadExtras(), so replies were fetched
into memory but never persisted to JSON. Move writeChannelData() after
downloadExtras() so replies are included in the written file."
```

---

### Task 2: Test the archiver write ordering fix

**Files:**
- Create: `archive/src/__tests__/cli.test.ts`

Write a test that verifies the archiver writes replies to disk. The test mocks the Slack API calls and filesystem, then asserts that the JSON written by `writeChannelData` contains replies on thread-parent messages.

- [ ] **Step 1: Write the test**

Create `archive/src/__tests__/cli.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock fs-extra before importing modules that use it
vi.mock("fs-extra", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readJSONSync: vi.fn(() => ({})),
    outputFileSync: vi.fn(),
  },
}));

// Mock config to avoid filesystem side effects
vi.mock("../config.js", () => ({
  DATA_DIR: "/tmp/test-data",
  BACKUPS_DIR: "/tmp/test-backups",
  CHANNELS_DATA_PATH: "/tmp/test-data/channels.json",
  EMOJIS_DATA_PATH: "/tmp/test-data/emojis.json",
  USERS_DATA_PATH: "/tmp/test-data/users.json",
  SLACK_ARCHIVE_DATA_PATH: "/tmp/test-data/slack-archive-data.json",
  SEARCH_FILE_PATH: "/tmp/test-data/search-index.json",
  AUTOMATIC_MODE: true,
  SNAPSHOT_MODE: false,
  getChannelDataFilePath: (id: string) => `/tmp/test-data/${id}.json`,
}));

import fs from "fs-extra";
import { writeChannelData } from "../data/write.js";
import { downloadExtras } from "../slack.js";
import type { ArchiveMessage } from "@slack-archive/types";

// We test the critical ordering: downloadExtras mutates message.replies,
// then writeChannelData persists them. This mirrors the fixed cli.ts flow.
describe("archiver write ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("replies are present in written data after downloadExtras populates them", async () => {
    // Simulate messages with thread metadata but no replies yet
    const messages: ArchiveMessage[] = [
      {
        ts: "1000.000",
        type: "message",
        text: "parent message",
        reply_count: 2,
        thread_ts: "1000.000",
      } as ArchiveMessage,
      {
        ts: "2000.000",
        type: "message",
        text: "standalone message",
      } as ArchiveMessage,
    ];

    // Simulate what downloadExtras does: mutate message.replies in place
    const mockReplies = [
      { ts: "1000.001", type: "message", text: "reply 1", thread_ts: "1000.000" },
      { ts: "1000.002", type: "message", text: "reply 2", thread_ts: "1000.000" },
    ];

    // Mutate the parent message as downloadExtras would
    messages[0].replies = mockReplies as any;

    // Now write — this is what cli.ts does after downloadExtras
    writeChannelData("C123", messages);

    // Verify fs.outputFileSync was called with data that includes replies
    expect(fs.outputFileSync).toHaveBeenCalledOnce();
    const [filePath, jsonStr] = (fs.outputFileSync as any).mock.calls[0];
    expect(filePath).toBe("/tmp/test-data/C123.json");

    const written = JSON.parse(jsonStr);
    expect(written).toHaveLength(2);

    // Parent message should have replies
    const parent = written.find((m: any) => m.ts === "1000.000");
    expect(parent.replies).toHaveLength(2);
    expect(parent.replies[0].text).toBe("reply 1");
    expect(parent.replies[1].text).toBe("reply 2");

    // Standalone message should not have replies
    const standalone = written.find((m: any) => m.ts === "2000.000");
    expect(standalone.replies).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd archive && pnpm test -- src/__tests__/cli.test.ts`
Expected: PASS — 1 test passing

- [ ] **Step 3: Commit**

```bash
git add archive/src/__tests__/cli.test.ts
git commit -m "test(archiver): verify replies are included in written channel data"
```

---

### Task 3: Extend search index to include thread replies

**Files:**
- Modify: `packages/types/src/index.ts:86-94`
- Modify: `archive/src/search.ts:191-224`

Add `thread_ts` to the search index schema and extend `createSearchIndex()` to index reply text.

- [ ] **Step 1: Add `thread_ts` to `SearchIndexSchema`**

In `packages/types/src/index.ts`, replace the `SearchIndexSchema` definition (lines 86-94):

```typescript
/** Backend search index — flat record keyed by message ID. */
export const SearchIndexSchema = z.record(
  z.string(),
  z.object({
    text: z.string(),
    file: z.string(),
    ts: z.string().optional(),
    thread_ts: z.string().optional(),
  }),
);
export type SearchIndex = z.infer<typeof SearchIndexSchema>;
```

- [ ] **Step 2: Rebuild the types package**

Run: `cd packages/types && pnpm build`
Expected: Clean compilation

- [ ] **Step 3: Extend `createSearchIndex` to index replies**

In `archive/src/search.ts`, replace the `createSearchIndex` function (lines 191-224):

```typescript
export async function createSearchIndex(
  dataDir: string,
  outFile: string
): Promise<void> {
  const files = getMessageJsonFiles(dataDir);
  const index: Record<string, { text: string; file: string; ts?: string; thread_ts?: string }> = {};

  for (const file of files) {
    let messages: any[];
    try {
      const raw = fs.readFileSync(file, "utf8");
      messages = JSON.parse(raw);
      if (!Array.isArray(messages)) continue;
    } catch (e) {
      // Not a message file, skip
      continue;
    }
    const relFile = path.relative(dataDir, file);
    for (const msg of messages) {
      // Use ts as unique ID, fallback to client_msg_id if present
      const id = msg.ts || msg.client_msg_id;
      if (!id) continue;
      const text = extractSearchableText(msg);
      if (text) {
        index[id] = { text, file: relFile, ts: msg.ts };
      }

      // Index thread replies
      if (Array.isArray(msg.replies)) {
        for (const reply of msg.replies) {
          const replyId = reply.ts || reply.client_msg_id;
          if (!replyId) continue;
          const replyText = extractSearchableText(reply);
          if (!replyText) continue;
          index[replyId] = {
            text: replyText,
            file: relFile,
            ts: reply.ts,
            thread_ts: msg.ts,
          };
        }
      }
    }
  }

  // Write the index to disk
  fs.writeFileSync(outFile, JSON.stringify(index, null, 2), "utf8");
}
```

Key changes:
- Extract `relFile` once per file instead of computing `path.relative` per message
- After indexing each top-level message, iterate `msg.replies[]`
- Each reply entry includes `thread_ts` pointing to the parent message's `ts`

- [ ] **Step 4: Build the archive package**

Run: `cd archive && pnpm build`
Expected: Clean compilation

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts archive/src/search.ts
git commit -m "feat(search): index thread reply text with thread_ts field"
```

---

### Task 4: Test search index reply indexing

**Files:**
- Create: `archive/src/__tests__/search.test.ts`

- [ ] **Step 1: Write the test**

Create `archive/src/__tests__/search.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createSearchIndex } from "../search.js";

// Mock the config module so getMessageJsonFiles uses our test channels.json
vi.mock("../config.js", () => ({
  CHANNELS_DATA_PATH: "", // Will be set per test
}));

import * as config from "../config.js";

describe("createSearchIndex", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "search-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("indexes top-level messages", async () => {
    const channelId = "C123TEST";
    const messages = [
      { ts: "1000.000", type: "message", text: "hello world" },
      { ts: "2000.000", type: "message", text: "goodbye world" },
    ];

    // Write test data
    fs.writeFileSync(path.join(tmpDir, `${channelId}.json`), JSON.stringify(messages));
    fs.writeFileSync(path.join(tmpDir, "channels.json"), JSON.stringify([{ id: channelId }]));
    // Point config at our channels.json
    (config as any).CHANNELS_DATA_PATH = path.join(tmpDir, "channels.json");

    const outFile = path.join(tmpDir, "search-index.json");
    await createSearchIndex(tmpDir, outFile);

    const index = JSON.parse(fs.readFileSync(outFile, "utf8"));
    expect(index["1000.000"]).toEqual({
      text: "hello world",
      file: `${channelId}.json`,
      ts: "1000.000",
    });
    expect(index["2000.000"].text).toBe("goodbye world");
    // Top-level messages should NOT have thread_ts
    expect(index["1000.000"].thread_ts).toBeUndefined();
  });

  test("indexes thread replies with thread_ts", async () => {
    const channelId = "C456TEST";
    const messages = [
      {
        ts: "1000.000",
        type: "message",
        text: "thread parent",
        reply_count: 2,
        thread_ts: "1000.000",
        replies: [
          { ts: "1000.001", type: "message", text: "first reply", thread_ts: "1000.000" },
          { ts: "1000.002", type: "message", text: "second reply", thread_ts: "1000.000" },
        ],
      },
      { ts: "2000.000", type: "message", text: "standalone" },
    ];

    fs.writeFileSync(path.join(tmpDir, `${channelId}.json`), JSON.stringify(messages));
    fs.writeFileSync(path.join(tmpDir, "channels.json"), JSON.stringify([{ id: channelId }]));
    (config as any).CHANNELS_DATA_PATH = path.join(tmpDir, "channels.json");

    const outFile = path.join(tmpDir, "search-index.json");
    await createSearchIndex(tmpDir, outFile);

    const index = JSON.parse(fs.readFileSync(outFile, "utf8"));

    // Parent message indexed without thread_ts
    expect(index["1000.000"].text).toBe("thread parent");
    expect(index["1000.000"].thread_ts).toBeUndefined();

    // Replies indexed with thread_ts pointing to parent
    expect(index["1000.001"]).toEqual({
      text: "first reply",
      file: `${channelId}.json`,
      ts: "1000.001",
      thread_ts: "1000.000",
    });
    expect(index["1000.002"].text).toBe("second reply");
    expect(index["1000.002"].thread_ts).toBe("1000.000");

    // Standalone message — no thread_ts
    expect(index["2000.000"].thread_ts).toBeUndefined();
  });

  test("skips replies with no text content", async () => {
    const channelId = "C789TEST";
    const messages = [
      {
        ts: "1000.000",
        type: "message",
        text: "parent",
        reply_count: 1,
        replies: [
          { ts: "1000.001", type: "message" }, // no text
        ],
      },
    ];

    fs.writeFileSync(path.join(tmpDir, `${channelId}.json`), JSON.stringify(messages));
    fs.writeFileSync(path.join(tmpDir, "channels.json"), JSON.stringify([{ id: channelId }]));
    (config as any).CHANNELS_DATA_PATH = path.join(tmpDir, "channels.json");

    const outFile = path.join(tmpDir, "search-index.json");
    await createSearchIndex(tmpDir, outFile);

    const index = JSON.parse(fs.readFileSync(outFile, "utf8"));
    expect(index["1000.000"]).toBeDefined();
    expect(index["1000.001"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd archive && pnpm test -- src/__tests__/search.test.ts`
Expected: PASS — 3 tests passing

- [ ] **Step 3: Commit**

```bash
git add archive/src/__tests__/search.test.ts
git commit -m "test(search): verify reply indexing with thread_ts field"
```

---

### Task 5: Add relative date helper and enhance thread indicator

**Files:**
- Create: `frontend/src/utils/relativeDate.ts`
- Modify: `frontend/src/components/ParentMessage.tsx`

- [ ] **Step 1: Create the relative date helper**

Create `frontend/src/utils/relativeDate.ts`:

```typescript
/**
 * Format a Unix timestamp string (seconds since epoch) as a relative date.
 * Returns strings like "2 hours ago", "yesterday", "3 days ago", "Mar 15".
 */
export function formatRelativeDate(ts: string): string {
  const date = new Date(Number(ts) * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;

  // Older than 30 days — show short date
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

- [ ] **Step 2: Update `ParentMessage` to show last-reply date**

In `frontend/src/components/ParentMessage.tsx`, add the import at the top (after the existing imports):

```typescript
import { formatRelativeDate } from '../utils/relativeDate';
```

Then replace the thread link block (lines 29-35):

```typescript
      {replyCount > 0 && (
        <div className="thread-link">
          <Link to={`/ws/${workspaceId}/c/${channelId}/t/${message.ts}`}>
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            {message.latest_reply && (
              <span className="thread-latest"> · {formatRelativeDate(message.latest_reply)}</span>
            )}
          </Link>
        </div>
      )}
```

The `latest_reply` field is a Unix timestamp string that Slack includes on thread-parent messages. It's part of the `MessageElement` type from `@slack/web-api`.

- [ ] **Step 3: Verify the frontend builds**

Run: `cd frontend && pnpm build`
Expected: Clean compilation

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/relativeDate.ts frontend/src/components/ParentMessage.tsx
git commit -m "feat(frontend): show last-reply date in thread indicator"
```

---

### Task 6: Update search result links for thread replies

**Files:**
- Modify: `frontend/src/components/SearchResults.tsx:95-104`

- [ ] **Step 1: Update the search result link to handle thread replies**

In `frontend/src/components/SearchResults.tsx`, replace the `<Link>` inside the results map (line 97):

```typescript
                <Link to={
                  result.thread_ts
                    ? `/ws/${workspaceId}/c/${result.channelId}/t/${result.thread_ts}/m/${result.ts}`
                    : `/ws/${workspaceId}/c/${result.channelId}/m/${result.ts}`
                }>
```

This checks if the search index entry has `thread_ts` (meaning it's a reply). If so, the link navigates into the thread view with the specific reply anchored. If not, the existing channel-message link is used.

- [ ] **Step 2: Add a "in thread" label for reply results**

In the same file, after the channel name div (line 98), add a thread indicator for reply results:

```typescript
                  <div className="search-result-channel">
                    #{result.channelName}
                    {result.thread_ts && <span className="search-result-thread"> · in thread</span>}
                  </div>
```

- [ ] **Step 3: Verify the frontend builds**

Run: `cd frontend && pnpm build`
Expected: Clean compilation

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SearchResults.tsx
git commit -m "feat(search): link reply results into thread view"
```

---

### Task 7: Manual smoke test

No files to modify — this is a verification task.

- [ ] **Step 1: Create test data with replies**

Create a temporary test JSON file with thread data to verify the full stack. In the project's `data/` directory, create or modify a channel file to include a message with replies:

```bash
cd /home/danlavoie/git/slack-archive
# Use a channel that exists in the dataset — pick one with threads
# After fixing the archiver, re-running it would populate replies.
# For now, manually inject test reply data into a channel file for smoke testing.
```

Alternatively, if the archiver has already been re-run after Task 1's fix, the data should already contain replies.

- [ ] **Step 2: Start the backend and frontend dev servers**

In separate terminals:
```bash
# Terminal 1 — backend
cd backend && ARCHIVE_DATA_DIR=../data pnpm dev

# Terminal 2 — frontend
cd frontend && pnpm dev
```

- [ ] **Step 3: Verify thread indicator in channel view**

Open a channel that has threaded messages. Verify:
- Messages with replies show "N replies · X ago" (or "N replies · Mar 15" for older threads)
- The text is a clickable link
- Messages without replies show no thread indicator

- [ ] **Step 4: Verify thread view**

Click the thread link. Verify:
- URL changes to `/ws/default/c/:channelId/t/:threadTs`
- Thread header shows "Back to #channel" link and reply count
- Parent message is displayed with a divider below it
- Replies are listed below the divider
- Each reply shows avatar, username, timestamp, and message text

- [ ] **Step 5: Verify reply anchoring**

Navigate directly to a URL like `/ws/default/c/:channelId/t/:threadTs/m/:replyTs` (use a reply's `ts` value). Verify:
- The thread view loads
- The specific reply scrolls into view and is highlighted briefly

- [ ] **Step 6: Verify search for reply text**

Search for text that only appears in a reply (not in any top-level message). Verify:
- The search result appears with "#channel · in thread" label
- Clicking the result navigates to the thread view with the reply highlighted

- [ ] **Step 7: Stop dev servers and commit any test data cleanup**

Clean up any manually injected test data. No commit needed if no files were changed.
