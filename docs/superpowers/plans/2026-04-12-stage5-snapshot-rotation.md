# Stage 5: Snapshot Backup & Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--snapshot` flag to the archiver CLI that, after a successful archive run, copies `DATA_DIR` to `BACKUPS_DIR/YYYY-MM-DD/` and rotates the directory to keep only the 5 most recent snapshots.

**Architecture:** One new module (`archive/src/utils/snapshot.ts`) with three pure functions: `createSnapshot` (copy), `rotateSnapshots` (prune), and `runSnapshot` (orchestrate). Driven from `cli.ts` behind a new `SNAPSHOT_MODE` flag. Tested with vitest against a real filesystem in a tmpdir (no mocking).

**Tech Stack:** TypeScript (ESM, NodeNext), vitest, fs-extra, date-fns, rimraf — all already in `archive/package.json`.

---

## Context

This plan implements Stage 5 from `docs/rebuild-plan.md:289-299`. Relevant prior decisions:

- **§7.4** — two backup behaviors are conflated in the existing code: (1) the transient pre-run safety backup in `backup.ts` (keep it), and (2) a new periodic preservation snapshot (this stage).
- **§8 Stage 5** — exit criterion: "Run it 6+ times with faked dates or by unit-testing the rotation logic." This plan uses unit tests, so the "faked dates" path is not required.
- **§10 hazards:**
  - `cleanup.sh` was broken because it `ls`-parsed the wrong directory. Use `fs.readdirSync` with an explicit path — never parse `ls` output.
  - `fs.statSync().isDirectory` is a method, not a property. Never destructure it.
- **CLAUDE.md feedback:** "don't add error handling for scenarios that can't happen … only validate at system boundaries." The snapshot module is a system boundary (filesystem), so real error paths get real handling. Pure-logic helpers don't.
- **User preference** (from memory `project_rebuild_decisions.md`): Zod + pnpm + Vite. This stage is CLI/filesystem only — no Zod schemas needed.

### Why vitest against real FS, not mocks

The feedback-testing memory captures a past burn: mock-based tests passed while production broke. This module does one thing — move directories around — and the correctness criterion is "did the files actually end up in the right place." Mocking `fs` gives you the wrong answer to the wrong question. Every test in this plan uses `os.tmpdir() + crypto.randomBytes` to get an isolated scratch directory, does real file operations, and asserts on real file state. `afterEach` cleans up.

### Why one file instead of splitting create/rotate

`createSnapshot` and `rotateSnapshots` are <50 LoC each, share a common argument (`backupsDir`), and are always called as a pair in production. Splitting them into separate files would create drive-by complexity with no payoff. Per Dan's feedback: "Three similar lines of code is better than a premature abstraction."

---

## File Structure

| File | Create / Modify | Responsibility |
|---|---|---|
| `archive/src/utils/snapshot.ts` | Create | `createSnapshot`, `rotateSnapshots`, `runSnapshot` |
| `archive/src/utils/__tests__/snapshot.test.ts` | Create | All snapshot module tests |
| `archive/src/config.ts` | Modify | Add `BACKUPS_DIR`, `SNAPSHOT_MODE` |
| `archive/src/cli.ts` | Modify | Call `runSnapshot` after `writeLastSuccessfulArchiveDate` when `SNAPSHOT_MODE` is set |
| `backup.sh` | Modify | Add deprecation header |
| `cleanup.sh` | Modify | Add deprecation header |

---

## Task 1: Add `BACKUPS_DIR` and `SNAPSHOT_MODE` to config

**Files:**
- Modify: `archive/src/config.ts`

- [ ] **Step 1: Add `SNAPSHOT_MODE` flag**

Open `archive/src/config.ts`. After the existing `NO_SEARCH` line (line 37), add:

```ts
export const SNAPSHOT_MODE = findCliParameter("--snapshot");
```

- [ ] **Step 2: Add `BACKUPS_DIR` constant**

In the same file, after the `EMOJIS_DIR` line (line 46), add:

```ts
export const BACKUPS_DIR = path.join(OUT_DIR, "backups");
```

Reasoning: per `rebuild-plan.md:344` (§9 decision 2), the layout is `{data, backups, config}` as siblings under `OUT_DIR`.

- [ ] **Step 3: Verify the archive package still builds**

Run: `cd archive && pnpm build`
Expected: `tsc` exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add archive/src/config.ts
git commit -m "feat(archive): add SNAPSHOT_MODE flag and BACKUPS_DIR config"
```

---

## Task 2: Create snapshot test file with first failing test for `createSnapshot`

**Files:**
- Create: `archive/src/utils/__tests__/snapshot.test.ts`

- [ ] **Step 1: Write the test file with a single failing test**

Create `archive/src/utils/__tests__/snapshot.test.ts` with:

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createSnapshot } from "../snapshot.js";

let scratch: string;

beforeEach(async () => {
  scratch = path.join(
    os.tmpdir(),
    `slack-archive-snapshot-test-${crypto.randomBytes(8).toString("hex")}`,
  );
  await fs.ensureDir(scratch);
});

afterEach(async () => {
  await fs.remove(scratch);
});

describe("createSnapshot", () => {
  test("copies dataDir into backupsDir/YYYY-MM-DD", async () => {
    const dataDir = path.join(scratch, "data");
    const backupsDir = path.join(scratch, "backups");
    await fs.ensureDir(dataDir);
    await fs.writeFile(path.join(dataDir, "foo.json"), '{"hi":1}');
    await fs.ensureDir(path.join(dataDir, "files", "C123"));
    await fs.writeFile(path.join(dataDir, "files", "C123", "a.txt"), "hello");

    await createSnapshot(dataDir, backupsDir, new Date("2026-04-12T10:00:00Z"));

    const target = path.join(backupsDir, "2026-04-12");
    expect(await fs.pathExists(target)).toBe(true);
    expect(await fs.readFile(path.join(target, "foo.json"), "utf8")).toBe('{"hi":1}');
    expect(
      await fs.readFile(path.join(target, "files", "C123", "a.txt"), "utf8"),
    ).toBe("hello");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd archive && pnpm test`
Expected: FAIL — import error `Cannot find module '../snapshot.js'` or similar. This is the test confirming the module doesn't exist yet.

- [ ] **Step 3: Create the snapshot module with minimal `createSnapshot` implementation**

Create `archive/src/utils/snapshot.ts`:

```ts
import fs from "fs-extra";
import path from "node:path";
import { format } from "date-fns";

/**
 * Copies `dataDir` into `backupsDir/YYYY-MM-DD/`, where the date comes
 * from the caller (injected for testability). If the target dir already
 * exists (e.g. a same-day re-snapshot), it is removed first so the
 * result is an exact mirror of the current dataDir, not a merge.
 */
export async function createSnapshot(
  dataDir: string,
  backupsDir: string,
  date: Date,
): Promise<string> {
  const dateDir = format(date, "yyyy-MM-dd");
  const target = path.join(backupsDir, dateDir);

  await fs.ensureDir(backupsDir);
  await fs.remove(target);
  await fs.copy(dataDir, target);

  return target;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd archive && pnpm test`
Expected: PASS. 1 test, 1 passed.

- [ ] **Step 5: Commit**

```bash
git add archive/src/utils/snapshot.ts archive/src/utils/__tests__/snapshot.test.ts
git commit -m "feat(archive): add createSnapshot — copy dataDir to backups/YYYY-MM-DD"
```

---

## Task 3: Test that `createSnapshot` overwrites same-day snapshots

**Files:**
- Modify: `archive/src/utils/__tests__/snapshot.test.ts`

- [ ] **Step 1: Add a new test inside the `describe("createSnapshot", ...)` block**

Add, after the existing test:

```ts
  test("overwrites an existing same-day snapshot (no merge)", async () => {
    const dataDir = path.join(scratch, "data");
    const backupsDir = path.join(scratch, "backups");
    await fs.ensureDir(dataDir);
    await fs.writeFile(path.join(dataDir, "new.json"), "new");

    // Pre-seed a stale snapshot with a file that should NOT survive.
    const staleTarget = path.join(backupsDir, "2026-04-12");
    await fs.ensureDir(staleTarget);
    await fs.writeFile(path.join(staleTarget, "old.json"), "old");

    await createSnapshot(dataDir, backupsDir, new Date("2026-04-12T10:00:00Z"));

    expect(await fs.pathExists(path.join(staleTarget, "new.json"))).toBe(true);
    expect(await fs.pathExists(path.join(staleTarget, "old.json"))).toBe(false);
  });
```

- [ ] **Step 2: Run the tests**

Run: `cd archive && pnpm test`
Expected: PASS. Both tests pass because the `await fs.remove(target)` line in `createSnapshot` (added in Task 2) already handles this — this test locks the behavior in so it can't regress.

- [ ] **Step 3: Commit**

```bash
git add archive/src/utils/__tests__/snapshot.test.ts
git commit -m "test(archive): lock in createSnapshot same-day overwrite behavior"
```

---

## Task 4: Add `rotateSnapshots` — keep the N most recent

**Files:**
- Modify: `archive/src/utils/snapshot.ts`
- Modify: `archive/src/utils/__tests__/snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new `describe` block at the end of `snapshot.test.ts`:

```ts
describe("rotateSnapshots", () => {
  test("keeps the N most recent dated directories, deletes the rest", async () => {
    const backupsDir = path.join(scratch, "backups");
    const dates = [
      "2026-04-06",
      "2026-04-07",
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
      "2026-04-11",
      "2026-04-12",
    ];
    for (const d of dates) {
      await fs.ensureDir(path.join(backupsDir, d));
    }

    await rotateSnapshots(backupsDir, 5);

    const remaining = (await fs.readdir(backupsDir)).sort();
    expect(remaining).toEqual([
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
      "2026-04-11",
      "2026-04-12",
    ]);
  });
});
```

Also update the import at the top of the test file:

```ts
import { createSnapshot, rotateSnapshots } from "../snapshot.js";
```

- [ ] **Step 2: Run the tests to confirm the new one fails**

Run: `cd archive && pnpm test`
Expected: FAIL — `rotateSnapshots is not a function` (import returns undefined).

- [ ] **Step 3: Implement `rotateSnapshots`**

Append to `archive/src/utils/snapshot.ts`:

```ts
const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Deletes all but the `keep` most recent YYYY-MM-DD directories under
 * `backupsDir`. Entries that don't match the date pattern are ignored
 * entirely (never listed, never deleted). A missing backupsDir is a
 * no-op, not an error.
 */
export async function rotateSnapshots(
  backupsDir: string,
  keep: number,
): Promise<string[]> {
  if (!(await fs.pathExists(backupsDir))) {
    return [];
  }

  const entries = await fs.readdir(backupsDir);
  const dateDirs = entries
    .filter((name) => DATE_DIR_PATTERN.test(name))
    .sort()
    .reverse(); // descending: newest first

  const toDelete = dateDirs.slice(keep);
  for (const name of toDelete) {
    await fs.remove(path.join(backupsDir, name));
  }
  return toDelete;
}
```

- [ ] **Step 4: Run the tests to confirm all pass**

Run: `cd archive && pnpm test`
Expected: PASS. 3 tests, 3 passed.

- [ ] **Step 5: Commit**

```bash
git add archive/src/utils/snapshot.ts archive/src/utils/__tests__/snapshot.test.ts
git commit -m "feat(archive): add rotateSnapshots — keep N most recent dated dirs"
```

---

## Task 5: `rotateSnapshots` ignores non-date entries

**Files:**
- Modify: `archive/src/utils/__tests__/snapshot.test.ts`

- [ ] **Step 1: Write the test**

Add inside the `describe("rotateSnapshots", ...)` block:

```ts
  test("ignores entries that don't match YYYY-MM-DD", async () => {
    const backupsDir = path.join(scratch, "backups");
    await fs.ensureDir(path.join(backupsDir, "2026-04-12"));
    await fs.ensureDir(path.join(backupsDir, "2026-04-11"));
    await fs.ensureDir(path.join(backupsDir, "README.md"));
    await fs.ensureDir(path.join(backupsDir, "not-a-date"));
    await fs.writeFile(path.join(backupsDir, "stray.txt"), "hi");

    await rotateSnapshots(backupsDir, 5);

    const remaining = (await fs.readdir(backupsDir)).sort();
    expect(remaining).toEqual([
      "2026-04-11",
      "2026-04-12",
      "README.md",
      "not-a-date",
      "stray.txt",
    ]);
  });
```

- [ ] **Step 2: Run the tests**

Run: `cd archive && pnpm test`
Expected: PASS. The regex filter in `rotateSnapshots` from Task 4 already handles this — this test locks the behavior in.

- [ ] **Step 3: Commit**

```bash
git add archive/src/utils/__tests__/snapshot.test.ts
git commit -m "test(archive): lock in rotateSnapshots non-date entry safety"
```

---

## Task 6: `rotateSnapshots` edge cases — fewer than N dirs, missing dir

**Files:**
- Modify: `archive/src/utils/__tests__/snapshot.test.ts`

- [ ] **Step 1: Write both edge-case tests**

Add inside the `describe("rotateSnapshots", ...)` block:

```ts
  test("is a no-op when fewer dirs exist than keep count", async () => {
    const backupsDir = path.join(scratch, "backups");
    await fs.ensureDir(path.join(backupsDir, "2026-04-11"));
    await fs.ensureDir(path.join(backupsDir, "2026-04-12"));

    const deleted = await rotateSnapshots(backupsDir, 5);

    expect(deleted).toEqual([]);
    const remaining = (await fs.readdir(backupsDir)).sort();
    expect(remaining).toEqual(["2026-04-11", "2026-04-12"]);
  });

  test("is a no-op when backupsDir does not exist", async () => {
    const backupsDir = path.join(scratch, "does-not-exist");

    const deleted = await rotateSnapshots(backupsDir, 5);

    expect(deleted).toEqual([]);
    expect(await fs.pathExists(backupsDir)).toBe(false);
  });
```

- [ ] **Step 2: Run the tests**

Run: `cd archive && pnpm test`
Expected: PASS. 5 tests, 5 passed.

- [ ] **Step 3: Commit**

```bash
git add archive/src/utils/__tests__/snapshot.test.ts
git commit -m "test(archive): lock in rotateSnapshots edge cases (few dirs, missing dir)"
```

---

## Task 7: Add `runSnapshot` orchestrator

**Files:**
- Modify: `archive/src/utils/snapshot.ts`
- Modify: `archive/src/utils/__tests__/snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new `describe` block at the end of `snapshot.test.ts`:

```ts
describe("runSnapshot", () => {
  test("creates today's snapshot and rotates to keep 5", async () => {
    const dataDir = path.join(scratch, "data");
    const backupsDir = path.join(scratch, "backups");
    await fs.ensureDir(dataDir);
    await fs.writeFile(path.join(dataDir, "today.json"), "today");

    // Pre-seed 5 older snapshots; after runSnapshot there should be
    // 5 total (the 4 most recent existing + today's new one).
    const seededDates = [
      "2020-01-01",
      "2020-01-02",
      "2020-01-03",
      "2020-01-04",
      "2020-01-05",
    ];
    for (const d of seededDates) {
      await fs.ensureDir(path.join(backupsDir, d));
    }

    await runSnapshot(dataDir, backupsDir);

    const remaining = (await fs.readdir(backupsDir)).sort();
    // Today's dir is always >= 2026-04-12, so it sorts to the end
    // and the oldest seeded one (2020-01-01) gets pruned.
    expect(remaining.length).toBe(5);
    expect(remaining.includes("2020-01-01")).toBe(false);
    const today = new Date().toISOString().slice(0, 10);
    expect(remaining.includes(today)).toBe(true);
    expect(
      await fs.readFile(path.join(backupsDir, today, "today.json"), "utf8"),
    ).toBe("today");
  });
});
```

Update the import at the top of the test file:

```ts
import { createSnapshot, rotateSnapshots, runSnapshot } from "../snapshot.js";
```

- [ ] **Step 2: Run the tests to confirm the new one fails**

Run: `cd archive && pnpm test`
Expected: FAIL — `runSnapshot is not a function`.

- [ ] **Step 3: Implement `runSnapshot`**

Append to `archive/src/utils/snapshot.ts`:

```ts
/**
 * Take a dated snapshot of `dataDir` into `backupsDir`, then prune
 * old snapshots down to `keep` (default 5). Uses the current date.
 * Returns the path of the snapshot that was just created.
 */
export async function runSnapshot(
  dataDir: string,
  backupsDir: string,
  keep: number = 5,
): Promise<string> {
  const target = await createSnapshot(dataDir, backupsDir, new Date());
  await rotateSnapshots(backupsDir, keep);
  return target;
}
```

- [ ] **Step 4: Run the tests to confirm all pass**

Run: `cd archive && pnpm test`
Expected: PASS. 6 tests, 6 passed.

- [ ] **Step 5: Commit**

```bash
git add archive/src/utils/snapshot.ts archive/src/utils/__tests__/snapshot.test.ts
git commit -m "feat(archive): add runSnapshot orchestrator (create + rotate)"
```

---

## Task 8: Wire `runSnapshot` into the CLI behind `SNAPSHOT_MODE`

**Files:**
- Modify: `archive/src/cli.ts`

- [ ] **Step 1: Add the import**

Open `archive/src/cli.ts`. Add `SNAPSHOT_MODE` and `BACKUPS_DIR` to the existing config import block (lines 13–21):

```ts
import {
  AUTOMATIC_MODE,
  BACKUPS_DIR,
  CHANNELS_DATA_PATH,
  DATA_DIR,
  EMOJIS_DATA_PATH,
  SEARCH_FILE_PATH,
  SLACK_ARCHIVE_DATA_PATH,
  SNAPSHOT_MODE,
  USERS_DATA_PATH,
} from "./config.js";
```

Then add the snapshot import after the backup import (line 9):

```ts
import { runSnapshot } from "./utils/snapshot.js";
```

- [ ] **Step 2: Call `runSnapshot` after a successful archive**

In the `try` block, after `await writeLastSuccessfulArchiveDate();` (currently line 156), add:

```ts
    if (SNAPSHOT_MODE) {
      try {
        const target = await runSnapshot(DATA_DIR, BACKUPS_DIR);
        logger.info(`Snapshot created at ${target}`);
      } catch (snapshotError) {
        // Archive already succeeded; don't let snapshot failure taint the run.
        logger.error("Snapshot failed (archive itself was successful)", {
          error: snapshotError,
        });
      }
    }
```

- [ ] **Step 3: Build to confirm the CLI still type-checks**

Run: `cd archive && pnpm build`
Expected: `tsc` exits 0, no errors.

- [ ] **Step 4: Run the full test suite**

Run: `cd archive && pnpm test`
Expected: PASS. 6 tests, 6 passed.

- [ ] **Step 5: Commit**

```bash
git add archive/src/cli.ts
git commit -m "feat(archive): wire --snapshot flag into CLI post-archive hook"
```

---

## Task 9: Deprecation headers on legacy shell scripts

**Files:**
- Modify: `backup.sh`
- Modify: `cleanup.sh`

Per `rebuild-plan.md:297`: mark legacy shell scripts as deprecated, leave the content in place, actual deletion happens in Stage 8.

- [ ] **Step 1: Read `backup.sh` so Edit will accept it**

Run: `cd /home/danlavoie/git/slack-archive && cat backup.sh`
Expected: prints the shell script contents.

- [ ] **Step 2: Add a deprecation header to `backup.sh`**

At the very top of `backup.sh` (after the `#!/...` shebang if present), insert:

```sh
# DEPRECATED: This script targets the legacy slack-archive output path
# and is retained only until Stage 8 of the rebuild (see docs/rebuild-plan.md).
# New deployments should use `pnpm --filter @slack-archive/archiver start -- --snapshot`
# which handles snapshotting and rotation inside the archiver itself.
```

- [ ] **Step 3: Add the same deprecation header to `cleanup.sh`**

Open `cleanup.sh` and insert the same block at the top (after the shebang).

- [ ] **Step 4: Commit**

```bash
git add backup.sh cleanup.sh
git commit -m "docs: mark legacy backup.sh and cleanup.sh as deprecated"
```

---

## Task 10: Final verification and summary commit

**Files:**
- None modified in this task

- [ ] **Step 1: Full test run**

Run: `cd archive && pnpm test`
Expected: 6 tests passed across 1 file.

- [ ] **Step 2: Full workspace build**

Run: `cd /home/danlavoie/git/slack-archive && pnpm -r build`
Expected: all 4 packages (`packages/types`, `archive`, `backend`, `frontend`) build clean.

- [ ] **Step 3: Smoke-test the flag without running a real archive**

This is a read-only sanity check that the flag is wired through. No real Slack call; we just confirm the CLI parses the flag.

Run: `cd archive && node --loader ts-node/esm -e "import('./src/config.js').then(m => console.log({ SNAPSHOT_MODE: m.SNAPSHOT_MODE, BACKUPS_DIR: m.BACKUPS_DIR }))" -- --snapshot`
Expected: prints `{ SNAPSHOT_MODE: true, BACKUPS_DIR: '<cwd>/slack-archive/backups' }`.

- [ ] **Step 4: Confirm git status is clean**

Run: `git status --short`
Expected: only the untracked `archive/archiver.out` (pre-existing, per the user's instruction not to touch it).

No commit for this task — Stage 5 is complete when step 3 is green.

---

## Self-Review

**Spec coverage** (against `rebuild-plan.md:289-299`):

| Spec requirement | Task |
|---|---|
| Add `--snapshot` flag to archiver CLI | Task 1 (config), Task 8 (wiring) |
| New module `archive/src/utils/snapshot.ts` | Tasks 2, 4, 7 |
| After successful archive, copy `DATA_DIR` → `BACKUPS_DIR/YYYY-MM-DD/` | Tasks 2, 7, 8 |
| Sort by YYYY-MM-DD dir name, keep 5 most recent, delete rest | Tasks 4, 5, 6 |
| Mark `backup.sh` / `cleanup.sh` deprecated | Task 9 |
| Exit criterion: unit-tested rotation logic | Tasks 4, 5, 6 (three tests covering happy path, non-date filter, edge cases) |

No gaps identified.

**Placeholder scan:** All task steps have literal code blocks and literal commands. No "TBD", no "handle edge cases" without showing the cases, no "similar to Task N" without repeating content.

**Type consistency:**
- `createSnapshot(dataDir, backupsDir, date)` — used consistently across Tasks 2, 3, 7.
- `rotateSnapshots(backupsDir, keep)` — used consistently across Tasks 4, 5, 6, 7.
- `runSnapshot(dataDir, backupsDir, keep?)` — used consistently in Tasks 7, 8.
- Return types: `createSnapshot` and `runSnapshot` return `Promise<string>` (the target dir); `rotateSnapshots` returns `Promise<string[]>` (names of deleted dirs). The test in Task 6 asserts on `rotateSnapshots` return value — consistent.
- Config names: `SNAPSHOT_MODE`, `BACKUPS_DIR` — used consistently in Tasks 1 and 8.
