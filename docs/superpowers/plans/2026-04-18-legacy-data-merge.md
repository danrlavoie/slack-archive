# Legacy Data Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-shot script to merge the legacy slack-archive dataset into the new archive format, producing a unified dataset the archiver CLI can incrementally update.

**Architecture:** A standalone TypeScript script (`archive/src/scripts/merge-legacy.ts`) that reads two source directories (legacy archive root + new data dir), merges channel messages by `ts` dedup, merges metadata files, copies static assets, and writes a complete archive to a new output directory. Tested via vitest with filesystem fixtures in tmpdir.

**Tech Stack:** TypeScript, fs-extra, lodash-es, vitest, @slack-archive/types

**Spec:** `docs/superpowers/specs/2026-04-18-legacy-data-merge-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `archive/src/scripts/merge-legacy.ts` | CLI entry point — arg parsing, orchestration, summary output |
| `archive/src/scripts/merge-channels.ts` | Channel message merge logic (ts-dedup, diff logging) |
| `archive/src/scripts/merge-metadata.ts` | Metadata file merge (channels.json, users.json, emojis.json, slack-archive.json) |
| `archive/src/scripts/merge-assets.ts` | Static asset copy (files/, avatars/, emojis/) |
| `archive/src/scripts/__tests__/merge-channels.test.ts` | Tests for channel message merge |
| `archive/src/scripts/__tests__/merge-metadata.test.ts` | Tests for metadata merge |
| `archive/src/scripts/__tests__/merge-assets.test.ts` | Tests for static asset copy |
| `archive/src/scripts/__tests__/merge-legacy.test.ts` | Integration test for full merge |

---

### Task 1: Channel Message Merge

**Files:**
- Create: `archive/src/scripts/merge-channels.ts`
- Create: `archive/src/scripts/__tests__/merge-channels.test.ts`

- [ ] **Step 1: Write failing test for basic ts-dedup merge**

```typescript
// archive/src/scripts/__tests__/merge-channels.test.ts
import { describe, test, expect } from "vitest";
import { mergeChannelMessages } from "../merge-channels.js";

describe("mergeChannelMessages", () => {
  test("combines messages from both sources, deduplicating by ts", () => {
    const legacy = [
      { ts: "1000.000", text: "old only", type: "message" },
      { ts: "2000.000", text: "overlap", type: "message" },
    ];
    const newer = [
      { ts: "2000.000", text: "overlap", type: "message" },
      { ts: "3000.000", text: "new only", type: "message" },
    ];

    const result = mergeChannelMessages(legacy, newer);

    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((m) => m.ts)).toEqual([
      "1000.000",
      "2000.000",
      "3000.000",
    ]);
    expect(result.stats.legacyOnly).toBe(1);
    expect(result.stats.newOnly).toBe(1);
    expect(result.stats.overlap).toBe(1);
    expect(result.stats.conflicts).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-channels.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement mergeChannelMessages**

```typescript
// archive/src/scripts/merge-channels.ts
import type { ArchiveMessage } from "@slack-archive/types";

export interface MergeStats {
  legacyOnly: number;
  newOnly: number;
  overlap: number;
  conflicts: number;
}

export interface ConflictEntry {
  channelId: string;
  ts: string;
  diffs: Array<{ field: string; legacy: unknown; new: unknown }>;
}

export interface MergeResult {
  messages: Array<ArchiveMessage>;
  stats: MergeStats;
  conflicts: Array<ConflictEntry>;
}

function diffMessages(
  legacy: ArchiveMessage,
  newer: ArchiveMessage,
): Array<{ field: string; legacy: unknown; new: unknown }> {
  const allKeys = new Set([...Object.keys(legacy), ...Object.keys(newer)]);
  const diffs: Array<{ field: string; legacy: unknown; new: unknown }> = [];

  for (const key of allKeys) {
    const lv = (legacy as Record<string, unknown>)[key];
    const nv = (newer as Record<string, unknown>)[key];
    if (JSON.stringify(lv) !== JSON.stringify(nv)) {
      diffs.push({ field: key, legacy: lv, new: nv });
    }
  }

  return diffs;
}

export function mergeChannelMessages(
  legacy: Array<ArchiveMessage>,
  newer: Array<ArchiveMessage>,
  channelId: string = "unknown",
): MergeResult {
  const merged = new Map<string, ArchiveMessage>();
  const legacySet = new Set<string>();
  const newSet = new Set<string>();
  const conflicts: Array<ConflictEntry> = [];

  // Insert legacy first
  for (const msg of legacy) {
    const ts = msg.ts ?? "";
    merged.set(ts, msg);
    legacySet.add(ts);
  }

  // Insert new — overwrites legacy on collision
  for (const msg of newer) {
    const ts = msg.ts ?? "";
    newSet.add(ts);

    if (merged.has(ts)) {
      // Check for diffs before overwriting
      const existing = merged.get(ts)!;
      const diffs = diffMessages(existing, msg);
      if (diffs.length > 0) {
        conflicts.push({ channelId, ts, diffs });
      }
    }

    merged.set(ts, msg);
  }

  const overlap = [...legacySet].filter((ts) => newSet.has(ts)).length;

  const messages = [...merged.values()].sort(
    (a, b) => parseFloat(a.ts ?? "0") - parseFloat(b.ts ?? "0"),
  );

  return {
    messages,
    stats: {
      legacyOnly: legacySet.size - overlap,
      newOnly: newSet.size - overlap,
      overlap,
      conflicts: conflicts.length,
    },
    conflicts,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-channels.test.ts`
Expected: PASS

- [ ] **Step 5: Write test for conflict detection (prefer new, log diff)**

Add to `merge-channels.test.ts`:

```typescript
  test("prefers new copy on ts collision and logs field-level diff", () => {
    const legacy = [
      { ts: "2000.000", text: "original text", type: "message", user: "U1" },
    ];
    const newer = [
      {
        ts: "2000.000",
        text: "edited text",
        type: "message",
        user: "U1",
        edited: { user: "U1", ts: "2500.000" },
      },
    ];

    const result = mergeChannelMessages(legacy, newer, "C_TEST");

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe("edited text");
    expect(result.stats.conflicts).toBe(1);
    expect(result.conflicts[0]).toEqual({
      channelId: "C_TEST",
      ts: "2000.000",
      diffs: [
        { field: "text", legacy: "original text", new: "edited text" },
        { field: "edited", legacy: undefined, new: { user: "U1", ts: "2500.000" } },
      ],
    });
  });

  test("does not flag conflict when overlapping messages are identical", () => {
    const msg = { ts: "2000.000", text: "same", type: "message", user: "U1" };
    const result = mergeChannelMessages([{ ...msg }], [{ ...msg }]);

    expect(result.stats.overlap).toBe(1);
    expect(result.stats.conflicts).toBe(0);
    expect(result.conflicts).toEqual([]);
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-channels.test.ts`
Expected: PASS (implementation already handles these cases)

- [ ] **Step 7: Write test for sort order (oldest first)**

Add to `merge-channels.test.ts`:

```typescript
  test("sorts output by ts ascending (oldest first)", () => {
    const legacy = [{ ts: "5000.000", text: "e", type: "message" }];
    const newer = [
      { ts: "1000.000", text: "a", type: "message" },
      { ts: "3000.000", text: "c", type: "message" },
    ];

    const result = mergeChannelMessages(legacy, newer);

    expect(result.messages.map((m) => m.ts)).toEqual([
      "1000.000",
      "3000.000",
      "5000.000",
    ]);
  });

  test("handles empty inputs gracefully", () => {
    expect(mergeChannelMessages([], []).messages).toEqual([]);
    expect(mergeChannelMessages([{ ts: "1.0", type: "message" }], []).messages).toHaveLength(1);
    expect(mergeChannelMessages([], [{ ts: "1.0", type: "message" }]).messages).toHaveLength(1);
  });
```

- [ ] **Step 8: Run full test file**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-channels.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add archive/src/scripts/merge-channels.ts archive/src/scripts/__tests__/merge-channels.test.ts
git commit -m "feat(merge): add channel message merge with ts-dedup and conflict logging"
```

---

### Task 2: Metadata File Merge

**Files:**
- Create: `archive/src/scripts/merge-metadata.ts`
- Create: `archive/src/scripts/__tests__/merge-metadata.test.ts`

- [ ] **Step 1: Write failing test for channels.json merge (array, dedup by id)**

```typescript
// archive/src/scripts/__tests__/merge-metadata.test.ts
import { describe, test, expect } from "vitest";
import { mergeChannelsJson, mergeObjectJson, mergeSlackArchiveJson } from "../merge-metadata.js";

describe("mergeChannelsJson", () => {
  test("deduplicates channels by id, preferring new", () => {
    const legacy = [
      { id: "C1", name: "general", num_members: 5 },
      { id: "C2", name: "random", num_members: 3 },
    ];
    const newer = [
      { id: "C1", name: "general", num_members: 8 },
      { id: "C3", name: "new-channel", num_members: 2 },
    ];

    const result = mergeChannelsJson(legacy, newer);

    expect(result).toHaveLength(3);
    const c1 = result.find((c: any) => c.id === "C1");
    expect(c1.num_members).toBe(8); // new wins
    expect(result.map((c: any) => c.id).sort()).toEqual(["C1", "C2", "C3"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-metadata.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement metadata merge functions**

```typescript
// archive/src/scripts/merge-metadata.ts
import type { Channel } from "@slack-archive/types";

/**
 * Merge two channels.json arrays. Deduplicates by `.id`, preferring the
 * newer copy when both sources contain the same channel.
 */
export function mergeChannelsJson(
  legacy: Array<Channel>,
  newer: Array<Channel>,
): Array<Channel> {
  const byId = new Map<string, Channel>();

  for (const ch of legacy) {
    if (ch.id) byId.set(ch.id, ch);
  }
  for (const ch of newer) {
    if (ch.id) byId.set(ch.id, ch);
  }

  return [...byId.values()];
}

/**
 * Merge two Record<string, T> objects. New wins on key conflict.
 * Used for users.json and emojis.json.
 */
export function mergeObjectJson<T>(
  legacy: Record<string, T>,
  newer: Record<string, T>,
): Record<string, T> {
  return { ...legacy, ...newer };
}

/**
 * Merge two slack-archive.json objects. Merges the `channels` record
 * (new wins per channel key). The `messages` count for each channel
 * will be recalculated by the caller after the actual channel files
 * are merged.
 */
export function mergeSlackArchiveJson(
  legacy: Record<string, any>,
  newer: Record<string, any>,
  actualMessageCounts: Record<string, number>,
): Record<string, any> {
  const mergedChannels: Record<string, any> = {};

  // Merge channel entries — legacy first, then new overwrites
  const allChannelIds = new Set([
    ...Object.keys(legacy.channels || {}),
    ...Object.keys(newer.channels || {}),
  ]);

  for (const id of allChannelIds) {
    const legacyEntry = legacy.channels?.[id] || {};
    const newEntry = newer.channels?.[id] || {};
    mergedChannels[id] = { ...legacyEntry, ...newEntry };
    // Override messages count with actual merged count
    if (id in actualMessageCounts) {
      mergedChannels[id].messages = actualMessageCounts[id];
    }
  }

  return {
    ...legacy,
    ...newer,
    channels: mergedChannels,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-metadata.test.ts`
Expected: PASS

- [ ] **Step 5: Write tests for mergeObjectJson and mergeSlackArchiveJson**

Add to `merge-metadata.test.ts`:

```typescript
describe("mergeObjectJson", () => {
  test("merges two objects, new wins on conflict", () => {
    const legacy = { U1: { name: "Alice" }, U2: { name: "Bob" } };
    const newer = { U1: { name: "Alice Updated" }, U3: { name: "Charlie" } };

    const result = mergeObjectJson(legacy, newer);

    expect(Object.keys(result).sort()).toEqual(["U1", "U2", "U3"]);
    expect(result.U1).toEqual({ name: "Alice Updated" });
    expect(result.U2).toEqual({ name: "Bob" });
  });

  test("handles empty inputs", () => {
    expect(mergeObjectJson({}, {})).toEqual({});
    expect(mergeObjectJson({ a: 1 }, {})).toEqual({ a: 1 });
    expect(mergeObjectJson({}, { b: 2 })).toEqual({ b: 2 });
  });
});

describe("mergeSlackArchiveJson", () => {
  test("merges channel records and applies actual message counts", () => {
    const legacy = {
      channels: {
        C1: { messages: 100 },
        C2: { messages: 50, fullyDownloaded: true },
      },
    };
    const newer = {
      channels: {
        C1: { messages: 20 },
        C3: { messages: 5 },
      },
      auth: { user_id: "U1" },
    };
    const actualCounts = { C1: 110, C2: 50, C3: 5 };

    const result = mergeSlackArchiveJson(legacy, newer, actualCounts);

    expect(result.channels.C1.messages).toBe(110);
    expect(result.channels.C2.messages).toBe(50);
    expect(result.channels.C2.fullyDownloaded).toBe(true);
    expect(result.channels.C3.messages).toBe(5);
    expect(result.auth).toEqual({ user_id: "U1" });
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-metadata.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add archive/src/scripts/merge-metadata.ts archive/src/scripts/__tests__/merge-metadata.test.ts
git commit -m "feat(merge): add metadata file merge for channels, users, emojis, slack-archive"
```

---

### Task 3: Static Asset Copy

**Files:**
- Create: `archive/src/scripts/merge-assets.ts`
- Create: `archive/src/scripts/__tests__/merge-assets.test.ts`

- [ ] **Step 1: Write failing test for asset copy**

```typescript
// archive/src/scripts/__tests__/merge-assets.test.ts
import { afterEach, beforeEach, describe, test, expect } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { copyAssets } from "../merge-assets.js";

let scratch: string;

beforeEach(async () => {
  scratch = path.join(
    os.tmpdir(),
    `merge-assets-test-${crypto.randomBytes(8).toString("hex")}`,
  );
  await fs.ensureDir(scratch);
});

afterEach(async () => {
  await fs.remove(scratch);
});

describe("copyAssets", () => {
  test("copies files from both sources, new wins on conflict", async () => {
    // Set up legacy assets
    const legacyDir = path.join(scratch, "legacy");
    await fs.ensureDir(path.join(legacyDir, "files", "C1"));
    await fs.writeFile(path.join(legacyDir, "files", "C1", "F001.png"), "legacy-file");
    await fs.ensureDir(path.join(legacyDir, "avatars"));
    await fs.writeFile(path.join(legacyDir, "avatars", "U1.png"), "legacy-avatar");
    await fs.ensureDir(path.join(legacyDir, "emojis"));
    await fs.writeFile(path.join(legacyDir, "emojis", "smile.png"), "legacy-emoji");

    // Set up new assets (with one conflicting avatar)
    const newDir = path.join(scratch, "new");
    await fs.ensureDir(path.join(newDir, "files", "C2"));
    await fs.writeFile(path.join(newDir, "files", "C2", "F002.png"), "new-file");
    await fs.ensureDir(path.join(newDir, "avatars"));
    await fs.writeFile(path.join(newDir, "avatars", "U1.png"), "new-avatar");
    await fs.ensureDir(path.join(newDir, "emojis"));
    await fs.writeFile(path.join(newDir, "emojis", "wave.gif"), "new-emoji");

    const outputDir = path.join(scratch, "output");

    const stats = await copyAssets(legacyDir, newDir, outputDir);

    // Legacy file preserved
    expect(await fs.readFile(path.join(outputDir, "files", "C1", "F001.png"), "utf8")).toBe("legacy-file");
    // New file copied
    expect(await fs.readFile(path.join(outputDir, "files", "C2", "F002.png"), "utf8")).toBe("new-file");
    // Conflict: new wins
    expect(await fs.readFile(path.join(outputDir, "avatars", "U1.png"), "utf8")).toBe("new-avatar");
    // Both emojis present
    expect(await fs.readFile(path.join(outputDir, "emojis", "smile.png"), "utf8")).toBe("legacy-emoji");
    expect(await fs.readFile(path.join(outputDir, "emojis", "wave.gif"), "utf8")).toBe("new-emoji");

    expect(stats.files).toBeGreaterThanOrEqual(2);
    expect(stats.avatars).toBeGreaterThanOrEqual(1);
    expect(stats.emojis).toBeGreaterThanOrEqual(2);
  });

  test("handles missing source directories gracefully", async () => {
    const legacyDir = path.join(scratch, "empty-legacy");
    const newDir = path.join(scratch, "empty-new");
    await fs.ensureDir(legacyDir);
    await fs.ensureDir(newDir);
    const outputDir = path.join(scratch, "output");

    const stats = await copyAssets(legacyDir, newDir, outputDir);

    expect(stats.files).toBe(0);
    expect(stats.avatars).toBe(0);
    expect(stats.emojis).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-assets.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement copyAssets**

```typescript
// archive/src/scripts/merge-assets.ts
import fs from "fs-extra";
import path from "node:path";

export interface AssetStats {
  files: number;
  avatars: number;
  emojis: number;
}

/**
 * Count files recursively in a directory.
 */
async function countFiles(dir: string): Promise<number> {
  if (!(await fs.pathExists(dir))) return 0;
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(full);
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Copy asset directories from both sources into output.
 * Legacy is copied first, then new overwrites on conflict.
 *
 * @param legacyAssetsDir - Directory containing legacy files/, avatars/, emojis/
 * @param newAssetsDir - Directory containing new files/, avatars/, emojis/
 * @param outputDir - Output directory to write merged assets into
 */
export async function copyAssets(
  legacyAssetsDir: string,
  newAssetsDir: string,
  outputDir: string,
): Promise<AssetStats> {
  const assetDirs = ["files", "avatars", "emojis"] as const;

  for (const dir of assetDirs) {
    const legacySrc = path.join(legacyAssetsDir, dir);
    const newSrc = path.join(newAssetsDir, dir);
    const dest = path.join(outputDir, dir);

    // Copy legacy first (if exists)
    if (await fs.pathExists(legacySrc)) {
      await fs.copy(legacySrc, dest, { overwrite: false });
    }

    // Copy new second — overwrites legacy on conflict
    if (await fs.pathExists(newSrc)) {
      await fs.copy(newSrc, dest, { overwrite: true });
    }
  }

  return {
    files: await countFiles(path.join(outputDir, "files")),
    avatars: await countFiles(path.join(outputDir, "avatars")),
    emojis: await countFiles(path.join(outputDir, "emojis")),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-assets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add archive/src/scripts/merge-assets.ts archive/src/scripts/__tests__/merge-assets.test.ts
git commit -m "feat(merge): add static asset copy with new-wins-on-conflict"
```

---

### Task 4: CLI Entry Point and Integration

**Files:**
- Create: `archive/src/scripts/merge-legacy.ts`
- Create: `archive/src/scripts/__tests__/merge-legacy.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// archive/src/scripts/__tests__/merge-legacy.test.ts
import { afterEach, beforeEach, describe, test, expect } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { runMerge } from "../merge-legacy.js";

let scratch: string;

beforeEach(async () => {
  scratch = path.join(
    os.tmpdir(),
    `merge-legacy-test-${crypto.randomBytes(8).toString("hex")}`,
  );
  await fs.ensureDir(scratch);
});

afterEach(async () => {
  await fs.remove(scratch);
});

/**
 * Helper to set up a minimal legacy archive layout:
 *   <root>/data/C1.json, channels.json, users.json, emojis.json, slack-archive.json
 *   <root>/html/files/C1/F1.png
 *   <root>/html/avatars/U1.png
 *   <root>/html/emojis/smile.png
 */
async function seedLegacy(root: string) {
  const dataDir = path.join(root, "data");
  const htmlDir = path.join(root, "html");

  await fs.outputJson(path.join(dataDir, "C1.json"), [
    { ts: "1000.000", text: "legacy only", type: "message", user: "U1" },
    { ts: "2000.000", text: "overlap msg", type: "message", user: "U1" },
  ]);
  await fs.outputJson(path.join(dataDir, "channels.json"), [
    { id: "C1", name: "general" },
  ]);
  await fs.outputJson(path.join(dataDir, "users.json"), {
    U1: { id: "U1", name: "alice" },
  });
  await fs.outputJson(path.join(dataDir, "emojis.json"), {
    smile: "https://emoji.slack-edge.com/smile.png",
  });
  await fs.outputJson(path.join(dataDir, "slack-archive.json"), {
    channels: { C1: { messages: 2 } },
  });

  await fs.ensureDir(path.join(htmlDir, "files", "C1"));
  await fs.writeFile(path.join(htmlDir, "files", "C1", "F1.png"), "legacy-file");
  await fs.ensureDir(path.join(htmlDir, "avatars"));
  await fs.writeFile(path.join(htmlDir, "avatars", "U1.png"), "legacy-avatar");
  await fs.ensureDir(path.join(htmlDir, "emojis"));
  await fs.writeFile(path.join(htmlDir, "emojis", "smile.png"), "legacy-emoji");
}

/**
 * Helper to set up a minimal new archive layout:
 *   <root>/C1.json, C2.json, channels.json, users.json, emojis.json, slack-archive.json
 *   <root>/files/C2/F2.png
 *   <root>/avatars/U1.png
 *   <root>/emojis/wave.gif
 */
async function seedNew(root: string) {
  await fs.outputJson(path.join(root, "C1.json"), [
    { ts: "2000.000", text: "overlap msg", type: "message", user: "U1" },
    { ts: "3000.000", text: "new only", type: "message", user: "U1" },
  ]);
  await fs.outputJson(path.join(root, "C2.json"), [
    { ts: "4000.000", text: "new channel msg", type: "message", user: "U2" },
  ]);
  await fs.outputJson(path.join(root, "channels.json"), [
    { id: "C1", name: "general", num_members: 10 },
    { id: "C2", name: "new-channel", num_members: 2 },
  ]);
  await fs.outputJson(path.join(root, "users.json"), {
    U1: { id: "U1", name: "alice-updated" },
    U2: { id: "U2", name: "bob" },
  });
  await fs.outputJson(path.join(root, "emojis.json"), {
    smile: "https://emoji.slack-edge.com/smile-v2.png",
    wave: "https://emoji.slack-edge.com/wave.gif",
  });
  await fs.outputJson(path.join(root, "slack-archive.json"), {
    channels: { C1: { messages: 2 }, C2: { messages: 1 } },
    auth: { user_id: "U1" },
  });

  await fs.ensureDir(path.join(root, "files", "C2"));
  await fs.writeFile(path.join(root, "files", "C2", "F2.png"), "new-file");
  await fs.ensureDir(path.join(root, "avatars"));
  await fs.writeFile(path.join(root, "avatars", "U1.png"), "new-avatar");
  await fs.ensureDir(path.join(root, "emojis"));
  await fs.writeFile(path.join(root, "emojis", "wave.gif"), "new-emoji");
}

describe("runMerge", () => {
  test("produces a complete merged archive from legacy + new sources", async () => {
    const legacyRoot = path.join(scratch, "legacy");
    const newDataDir = path.join(scratch, "new");
    const outputDir = path.join(scratch, "output");

    await seedLegacy(legacyRoot);
    await seedNew(newDataDir);

    const summary = await runMerge(legacyRoot, newDataDir, outputDir);

    // --- Channel messages ---
    const dataDir = path.join(outputDir, "data");
    const c1 = await fs.readJson(path.join(dataDir, "C1.json"));
    expect(c1).toHaveLength(3);
    expect(c1.map((m: any) => m.ts)).toEqual(["1000.000", "2000.000", "3000.000"]);

    const c2 = await fs.readJson(path.join(dataDir, "C2.json"));
    expect(c2).toHaveLength(1);

    // --- Metadata ---
    const channels = await fs.readJson(path.join(dataDir, "channels.json"));
    expect(channels).toHaveLength(2);
    const c1Meta = channels.find((c: any) => c.id === "C1");
    expect(c1Meta.num_members).toBe(10); // new wins

    const users = await fs.readJson(path.join(dataDir, "users.json"));
    expect(users.U1.name).toBe("alice-updated"); // new wins
    expect(users.U2.name).toBe("bob");

    const emojis = await fs.readJson(path.join(dataDir, "emojis.json"));
    expect(emojis.smile).toContain("v2"); // new wins
    expect(emojis.wave).toBeDefined();

    const archive = await fs.readJson(path.join(dataDir, "slack-archive.json"));
    expect(archive.channels.C1.messages).toBe(3); // actual merged count
    expect(archive.channels.C2.messages).toBe(1);
    expect(archive.auth).toEqual({ user_id: "U1" });

    // --- Static assets ---
    expect(await fs.readFile(path.join(dataDir, "files", "C1", "F1.png"), "utf8")).toBe("legacy-file");
    expect(await fs.readFile(path.join(dataDir, "files", "C2", "F2.png"), "utf8")).toBe("new-file");
    expect(await fs.readFile(path.join(dataDir, "avatars", "U1.png"), "utf8")).toBe("new-avatar");
    expect(await fs.readFile(path.join(dataDir, "emojis", "smile.png"), "utf8")).toBe("legacy-emoji");
    expect(await fs.readFile(path.join(dataDir, "emojis", "wave.gif"), "utf8")).toBe("new-emoji");

    // --- Summary ---
    expect(summary.totalMessages).toBe(4);
    expect(summary.totalChannels).toBe(2);
  });

  test("rejects when output directory already exists", async () => {
    const legacyRoot = path.join(scratch, "legacy");
    const newDataDir = path.join(scratch, "new");
    const outputDir = path.join(scratch, "output");

    await seedLegacy(legacyRoot);
    await seedNew(newDataDir);
    await fs.ensureDir(outputDir); // pre-create

    await expect(runMerge(legacyRoot, newDataDir, outputDir)).rejects.toThrow(
      /already exists/,
    );
  });

  test("rejects when legacy directory does not exist", async () => {
    const newDataDir = path.join(scratch, "new");
    const outputDir = path.join(scratch, "output");

    await seedNew(newDataDir);

    await expect(
      runMerge(path.join(scratch, "nonexistent"), newDataDir, outputDir),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-legacy.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement merge-legacy.ts**

```typescript
// archive/src/scripts/merge-legacy.ts
import fs from "fs-extra";
import path from "node:path";
import { mergeChannelMessages, type ConflictEntry, type MergeStats } from "./merge-channels.js";
import { mergeChannelsJson, mergeObjectJson, mergeSlackArchiveJson } from "./merge-metadata.js";
import { copyAssets, type AssetStats } from "./merge-assets.js";

export interface MergeSummary {
  totalMessages: number;
  totalChannels: number;
  totalConflicts: number;
  channels: Array<{ id: string; stats: MergeStats }>;
  conflicts: Array<ConflictEntry>;
  assets: AssetStats;
}

/**
 * Discover channel file IDs (C* and D* JSON files) in a directory.
 */
function discoverChannelFiles(dir: string, entries: string[]): string[] {
  return entries
    .filter((f) => /^[CD][A-Z0-9]+\.json$/.test(f))
    .map((f) => f.replace(".json", ""));
}

/**
 * Run the full merge: channel messages, metadata, and static assets.
 *
 * @param legacyRoot - Legacy archive root (contains data/ and html/)
 * @param newDataDir - New archive data directory (contains JSONs and asset subdirs)
 * @param outputDir - Output archive root (will contain data/ with everything)
 */
export async function runMerge(
  legacyRoot: string,
  newDataDir: string,
  outputDir: string,
): Promise<MergeSummary> {
  // --- Validation ---
  if (await fs.pathExists(outputDir)) {
    throw new Error(`Output directory already exists: ${outputDir}`);
  }
  const legacyDataDir = path.join(legacyRoot, "data");
  if (!(await fs.pathExists(legacyDataDir))) {
    throw new Error(`Legacy data directory not found: ${legacyDataDir}`);
  }
  if (!(await fs.pathExists(newDataDir))) {
    throw new Error(`New data directory not found: ${newDataDir}`);
  }

  const outputDataDir = path.join(outputDir, "data");
  await fs.ensureDir(outputDataDir);

  // --- Discover channels ---
  const legacyEntries = await fs.readdir(legacyDataDir);
  const newEntries = await fs.readdir(newDataDir);

  const legacyChannelIds = discoverChannelFiles(legacyDataDir, legacyEntries);
  const newChannelIds = discoverChannelFiles(newDataDir, newEntries);
  const allChannelIds = [...new Set([...legacyChannelIds, ...newChannelIds])];

  // --- Merge channel messages ---
  const channelResults: Array<{ id: string; stats: MergeStats }> = [];
  const allConflicts: Array<ConflictEntry> = [];
  const actualMessageCounts: Record<string, number> = {};
  let totalMessages = 0;

  for (const channelId of allChannelIds) {
    const legacyFile = path.join(legacyDataDir, `${channelId}.json`);
    const newFile = path.join(newDataDir, `${channelId}.json`);

    const legacyMsgs = (await fs.pathExists(legacyFile))
      ? await fs.readJson(legacyFile)
      : [];
    const newMsgs = (await fs.pathExists(newFile))
      ? await fs.readJson(newFile)
      : [];

    const result = mergeChannelMessages(legacyMsgs, newMsgs, channelId);

    await fs.outputJson(
      path.join(outputDataDir, `${channelId}.json`),
      result.messages,
      { spaces: 2 },
    );

    channelResults.push({ id: channelId, stats: result.stats });
    allConflicts.push(...result.conflicts);
    actualMessageCounts[channelId] = result.messages.length;
    totalMessages += result.messages.length;
  }

  // --- Merge metadata ---
  const legacyChannelsJson = (await fs.pathExists(path.join(legacyDataDir, "channels.json")))
    ? await fs.readJson(path.join(legacyDataDir, "channels.json"))
    : [];
  const newChannelsJson = (await fs.pathExists(path.join(newDataDir, "channels.json")))
    ? await fs.readJson(path.join(newDataDir, "channels.json"))
    : [];
  await fs.outputJson(
    path.join(outputDataDir, "channels.json"),
    mergeChannelsJson(legacyChannelsJson, newChannelsJson),
    { spaces: 2 },
  );

  const legacyUsers = (await fs.pathExists(path.join(legacyDataDir, "users.json")))
    ? await fs.readJson(path.join(legacyDataDir, "users.json"))
    : {};
  const newUsers = (await fs.pathExists(path.join(newDataDir, "users.json")))
    ? await fs.readJson(path.join(newDataDir, "users.json"))
    : {};
  await fs.outputJson(
    path.join(outputDataDir, "users.json"),
    mergeObjectJson(legacyUsers, newUsers),
    { spaces: 2 },
  );

  const legacyEmojis = (await fs.pathExists(path.join(legacyDataDir, "emojis.json")))
    ? await fs.readJson(path.join(legacyDataDir, "emojis.json"))
    : {};
  const newEmojis = (await fs.pathExists(path.join(newDataDir, "emojis.json")))
    ? await fs.readJson(path.join(newDataDir, "emojis.json"))
    : {};
  await fs.outputJson(
    path.join(outputDataDir, "emojis.json"),
    mergeObjectJson(legacyEmojis, newEmojis),
    { spaces: 2 },
  );

  const legacyArchive = (await fs.pathExists(path.join(legacyDataDir, "slack-archive.json")))
    ? await fs.readJson(path.join(legacyDataDir, "slack-archive.json"))
    : { channels: {} };
  const newArchive = (await fs.pathExists(path.join(newDataDir, "slack-archive.json")))
    ? await fs.readJson(path.join(newDataDir, "slack-archive.json"))
    : { channels: {} };
  await fs.outputJson(
    path.join(outputDataDir, "slack-archive.json"),
    mergeSlackArchiveJson(legacyArchive, newArchive, actualMessageCounts),
    { spaces: 2 },
  );

  // --- Copy static assets ---
  // Legacy: <legacyRoot>/html/{files,avatars,emojis}
  // New: <newDataDir>/{files,avatars,emojis}
  // Output: <outputDir>/data/{files,avatars,emojis}
  const legacyAssetsDir = path.join(legacyRoot, "html");
  const assets = await copyAssets(legacyAssetsDir, newDataDir, outputDataDir);

  // --- Print summary ---
  const summary: MergeSummary = {
    totalMessages,
    totalChannels: allChannelIds.length,
    totalConflicts: allConflicts.length,
    channels: channelResults,
    conflicts: allConflicts,
    assets,
  };

  return summary;
}

function formatConflict(c: ConflictEntry): string {
  const diffs = c.diffs
    .map((d) => `  ${d.field}: ${JSON.stringify(d.legacy)} → ${JSON.stringify(d.new)}`)
    .join("\n");
  return `WARN: ${c.channelId} ts=${c.ts} differs:\n${diffs}`;
}

/**
 * CLI entry point. Parses args, runs merge, prints summary.
 */
async function main() {
  const [legacyRoot, newDataDir, outputDir] = process.argv.slice(2);

  if (!legacyRoot || !newDataDir || !outputDir) {
    console.error(
      "Usage: merge-legacy <legacy-root> <new-data-dir> <output-dir>",
    );
    console.error("");
    console.error("  legacy-root   Legacy archive root (contains data/ and html/)");
    console.error("  new-data-dir  New archive data directory (JSONs + asset subdirs)");
    console.error("  output-dir    Output archive root (must not exist)");
    process.exit(1);
  }

  console.log("Starting legacy data merge...");
  console.log(`  Legacy: ${legacyRoot}`);
  console.log(`  New:    ${newDataDir}`);
  console.log(`  Output: ${outputDir}`);
  console.log("");

  const summary = await runMerge(
    path.resolve(legacyRoot),
    path.resolve(newDataDir),
    path.resolve(outputDir),
  );

  // Print conflicts
  if (summary.conflicts.length > 0) {
    console.log(`\n--- Conflicts (${summary.totalConflicts}) ---\n`);
    for (const c of summary.conflicts) {
      console.log(formatConflict(c));
    }
  }

  // Print per-channel summary
  console.log("\n--- Per-channel summary ---\n");
  for (const ch of summary.channels) {
    const { legacyOnly, newOnly, overlap, conflicts } = ch.stats;
    const total = legacyOnly + newOnly + overlap;
    console.log(
      `${ch.id}: ${total} messages (${legacyOnly} legacy-only, ${newOnly} new-only, ${overlap} overlap, ${conflicts} conflicts)`,
    );
  }

  // Print totals
  console.log(`\nTotal: ${summary.totalMessages} messages across ${summary.totalChannels} channels, ${summary.totalConflicts} conflicts`);
  console.log(`Files: ${summary.assets.files} | Avatars: ${summary.assets.avatars} | Emojis: ${summary.assets.emojis}`);
  console.log("\nMerge complete.");
}

// ESM entry point guard
const isMain = process.argv[1] &&
  (await import("node:url")).fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error("Merge failed:", err.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run integration test to verify it passes**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/merge-legacy.test.ts`
Expected: PASS

- [ ] **Step 5: Run all merge tests together**

Run: `cd archive && pnpm test -- --run src/scripts/__tests__/`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add archive/src/scripts/merge-legacy.ts archive/src/scripts/__tests__/merge-legacy.test.ts
git commit -m "feat(merge): add CLI entry point and integration test for legacy data merge"
```

---

### Task 5: Dry Run Against Real Data

**Files:**
- No file changes — manual verification only.

- [ ] **Step 1: Run the merge against the real datasets**

```bash
cd archive
pnpm tsx src/scripts/merge-legacy.ts \
  ~/Documents/slack-archive/slack-archive \
  ../data \
  ../merged-archive
```

Expected: completes without errors, prints per-channel summary and conflict log.

- [ ] **Step 2: Verify the output**

```bash
# Check channel message counts
python3 -c "
import json, os
data_dir = '../merged-archive/data'
for f in sorted(os.listdir(data_dir)):
    if f[0] in 'CD' and f.endswith('.json'):
        msgs = json.load(open(os.path.join(data_dir, f)))
        print(f'{f}: {len(msgs)} messages')
"

# Check static asset counts
echo "Files:"; find ../merged-archive/data/files -type f | wc -l
echo "Avatars:"; ls ../merged-archive/data/avatars/ | wc -l
echo "Emojis:"; ls ../merged-archive/data/emojis/ | wc -l
```

Expected: CL0AVQ3T3 should have ~90k messages (69k legacy-only + 7k new-only + 15k overlap). All static assets from both sources present.

- [ ] **Step 3: Review the conflict log**

Scan the merge output for `WARN:` lines. Verify they look like expected message edits (changed `text`, added `edited` field, etc.) rather than structural format differences.

- [ ] **Step 4: Spot-check a few merged channel files**

```bash
# Verify oldest message is from legacy, newest from new
python3 -c "
import json
msgs = json.load(open('../merged-archive/data/CL0AVQ3T3.json'))
print(f'Oldest: ts={msgs[0][\"ts\"]}')
print(f'Newest: ts={msgs[-1][\"ts\"]}')
print(f'Total: {len(msgs)}')
"
```

- [ ] **Step 5: Smoke test with backend + frontend**

```bash
# In one terminal — start backend pointed at merged data
cd backend
DATA_DIR=../merged-archive/data pnpm dev

# In another terminal — start frontend
cd frontend
pnpm dev
```

Open browser, verify channels load, messages render, scroll through history to confirm legacy messages appear.

- [ ] **Step 6: Smoke test with archiver**

```bash
cd archive
ARCHIVE_OUT_DIR=../merged-archive pnpm start -- --automatic
```

Verify: archiver reads existing data, fetches only recent messages, appends without overwriting legacy content. After run, re-check CL0AVQ3T3 message count — it should be >= the pre-run count.

- [ ] **Step 7: Clean up merged-archive (or keep for UnRAID copy)**

If all smoke tests pass, the merged-archive directory is ready for Dan to copy to UnRAID. Do NOT delete it.

---

## Self-Review

**Spec coverage:**
- Channel message merge with ts-dedup: Task 1 ✓
- Conflict logging with field-level diff: Task 1 ✓
- Prefer new on collision: Task 1 ✓
- Sort ascending: Task 1 ✓
- channels.json dedup by id: Task 2 ✓
- users.json/emojis.json object merge: Task 2 ✓
- slack-archive.json merge with actual message counts: Task 2 ✓
- Static asset copy with new-wins: Task 3 ✓
- Output dir must not exist: Task 4 (integration test) ✓
- Legacy/new dir validation: Task 4 ✓
- Summary output: Task 4 ✓
- No search index generation: Not mentioned (correctly omitted) ✓
- No .last-successful-run: Not mentioned (correctly omitted) ✓
- Dry run + smoke tests: Task 5 ✓

**Placeholder scan:** No TBDs, TODOs, or incomplete sections found.

**Type consistency:** `MergeStats`, `ConflictEntry`, `MergeSummary`, `AssetStats` — used consistently across all tasks. `mergeChannelMessages` signature matches in Task 1 definition and Task 4 usage. `copyAssets` signature matches in Task 3 definition and Task 4 usage.
