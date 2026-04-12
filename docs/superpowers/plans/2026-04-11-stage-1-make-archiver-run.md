# Stage 1: Make the Archiver Actually Run — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm start -- --automatic` in `archive/` downloads a real Slack workspace end-to-end and exits 0.

**Architecture:** Fix the build/run infrastructure (missing tsconfig, ESM entrypoint, ts-node config), repair broken imports and bugs found during code archaeology, and unify data paths so the archiver writes to the canonical `slack-archive/` directory that later stages (backend, frontend) will read from.

**Tech Stack:** TypeScript 5.8, pnpm, ts-node (ESM), Node 24, `@slack/web-api` v7, `fs-extra`, `winston`

---

## Bugs Found During Archaeology

This plan fixes 7 distinct bugs. Numbering them here so tasks can reference them:

1. **No tsconfig.json.** `archive/` has no `tsconfig.json`. `pnpm build` (`tsc`) cannot run.
2. **ESM entrypoint dead code.** `archive/src/cli.ts:164` uses `require.main === module`, which is always false in ESM. `main()` never gets called.
3. **ts-node ESM misconfiguration.** `pnpm start` runs `ts-node src/cli.ts`, but the package is `"type": "module"` — ts-node needs the `--esm` flag or equivalent config.
4. **Broken cross-package import.** `archive/src/slack.ts:33` imports `getChannels` from `"../../src/data-load.js"` (legacy root `src/`). Also `slack.ts:34` imports `writeChannelData` from `"../data/write.js"` (wrong relative path — should be `"./data/write.js"`).
5. **Data path mismatch.** `archive/src/config.ts:47` writes to `slack-archive-new/`. The backend reads from `slack-archive/`. Standardize on `slack-archive/`, controlled by `SLACK_ARCHIVE_DATA_DIR` env var.
6. **`fs.statSync().isDirectory` bug.** `archive/src/utils/backup.ts:156` destructures `isDirectory` as a property, but it's a method on `fs.Stats`. The check `if (!isDirectory) continue` never triggers.
7. **`readFile` ignores its argument.** `archive/src/utils/data-load.ts:73` always reads `SEARCH_DATA_PATH` regardless of the `filePath` parameter passed to it.

## File Structure

Files modified (no new files created except `tsconfig.json` and the test infrastructure):

| File | Change |
|------|--------|
| Create: `archive/tsconfig.json` | TypeScript config for ESM Node project |
| Create: `archive/vitest.config.ts` | Vitest config for the test runner |
| Create: `archive/src/__tests__/config.test.ts` | Tests for config path resolution |
| Create: `archive/src/__tests__/backup.test.ts` | Tests for backup utilities |
| Create: `archive/src/__tests__/data-load.test.ts` | Tests for data loading |
| Modify: `archive/package.json` | Fix `start` script for ESM, add vitest, update `test` script |
| Modify: `archive/src/cli.ts:164-169` | Fix ESM entrypoint |
| Modify: `archive/src/config.ts:47` | Env-var-driven `OUT_DIR`, default to `slack-archive/` |
| Modify: `archive/src/slack.ts:33-34` | Fix broken imports |
| Modify: `archive/src/utils/backup.ts:156` | Fix `isDirectory` bug |
| Modify: `archive/src/utils/data-load.ts:71-75` | Fix `readFile` bug |

---

### Task 1: Add tsconfig.json and fix package.json scripts

**Files:**
- Create: `archive/tsconfig.json`
- Modify: `archive/package.json`

- [ ] **Step 1: Create `archive/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Update `archive/package.json` scripts**

Change the `scripts` section to:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node --loader ts-node/esm src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

The key change: `ts-node src/cli.ts` → `node --loader ts-node/esm src/cli.ts`. Plain `ts-node` doesn't handle ESM; the `--loader` flag is required for `"type": "module"` packages.

- [ ] **Step 3: Add vitest as a dev dependency**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm add -D vitest`

- [ ] **Step 4: Create `archive/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Verify `pnpm build` runs without error**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm build`

Expected: tsc compiles. There will likely be type errors from the broken imports in `slack.ts` — that's expected and fixed in Task 3. If tsc fails on the import from `../../src/data-load.js`, that confirms Bug #4. Note the errors and proceed.

- [ ] **Step 6: Commit**

```bash
cd /home/danlavoie/git/slack-archive/archive
git add tsconfig.json vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat(archive): add tsconfig.json, vitest, fix start script for ESM"
```

---

### Task 2: Fix ESM entrypoint in cli.ts

**Files:**
- Modify: `archive/src/cli.ts:164-169`

- [ ] **Step 1: Replace the dead `require.main === module` guard**

In `archive/src/cli.ts`, replace lines 164–169:

```typescript
if (require.main === module) {
  main().catch((error) => {
    logger.error("Exiting due to error", { error });
    process.exit(1);
  });
}
```

With:

```typescript
main().catch((error) => {
  logger.error("Exiting due to error", { error });
  process.exit(1);
});
```

This is a CLI entrypoint — it will only ever be run directly, never imported as a library. The guard is unnecessary and broken in ESM. Drop it entirely.

- [ ] **Step 2: Commit**

```bash
git add archive/src/cli.ts
git commit -m "fix(archive): remove broken require.main ESM entrypoint guard"
```

---

### Task 3: Fix broken imports in slack.ts

**Files:**
- Modify: `archive/src/slack.ts:26-34`

- [ ] **Step 1: Replace the broken imports**

In `archive/src/slack.ts`, replace lines 33–34:

```typescript
import { getChannels } from "../../src/data-load.js";
import { writeChannelData } from "../data/write.js";
```

With:

```typescript
import { getChannels } from "./utils/data-load.js";
import { writeChannelData } from "./data/write.js";
```

Also, `slack.ts` imports `getChannelDataFilePath` and `USERS_DATA_PATH` from config (line 12–13) but neither is used in the current code outside of the removed `downloadEachChannel`/`downloadChannel` functions. However — `getChannelDataFilePath` is **not used** in slack.ts (it was used via the removed cross-package import path). `USERS_DATA_PATH` is also not used directly. Leave them for now — unused imports are a cleanup concern, not a correctness bug.

- [ ] **Step 2: Verify `pnpm build` now compiles**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm build`

Expected: tsc compiles without errors (or with only non-import-related warnings).

- [ ] **Step 3: Commit**

```bash
git add archive/src/slack.ts
git commit -m "fix(archive): replace broken cross-package imports in slack.ts"
```

---

### Task 4: Unify data path — eliminate `slack-archive-new`

**Files:**
- Modify: `archive/src/config.ts:46-47`
- Create: `archive/src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `archive/src/__tests__/config.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config path resolution", () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    process.cwd = originalCwd;
  });

  it("uses SLACK_ARCHIVE_DATA_DIR env var when set", async () => {
    process.env.SLACK_ARCHIVE_DATA_DIR = "/custom/path";
    const config = await import("../config.js");
    expect(config.OUT_DIR).toBe("/custom/path");
    expect(config.DATA_DIR).toContain("/custom/path");
  });

  it("defaults to slack-archive/ under cwd when env var is not set", async () => {
    delete process.env.SLACK_ARCHIVE_DATA_DIR;
    const config = await import("../config.js");
    expect(config.OUT_DIR).toContain("slack-archive");
    expect(config.OUT_DIR).not.toContain("slack-archive-new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm test -- src/__tests__/config.test.ts`

Expected: FAIL — `OUT_DIR` currently contains `slack-archive-new` and doesn't read `SLACK_ARCHIVE_DATA_DIR`.

- [ ] **Step 3: Fix `archive/src/config.ts`**

Replace line 46–47:

```typescript
export const BASE_DIR = process.cwd();
export const OUT_DIR = path.join(BASE_DIR, "slack-archive-new");
```

With:

```typescript
export const BASE_DIR = process.cwd();
export const OUT_DIR = process.env.SLACK_ARCHIVE_DATA_DIR ?? path.join(BASE_DIR, "slack-archive");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm test -- src/__tests__/config.test.ts`

Expected: PASS

- [ ] **Step 5: Also remove dead HTML-related exports from config.ts**

The archiver doesn't generate HTML. These paths are dead code inherited from the legacy monolith. Remove the following exports from `archive/src/config.ts`:

Remove these lines (56–62):

```typescript
export const INDEX_PATH = path.join(OUT_DIR, "index.html");
export const SEARCH_PATH = path.join(OUT_DIR, "search.html");
export const MESSAGES_JS_PATH = path.join(__dirname, "../static/scroll.js");
export const SEARCH_TEMPLATE_PATH = path.join(
  __dirname,
  "../static/search.html",
);
```

And these functions that are only used for HTML generation (lines 81–87):

```typescript
export function getHTMLFilePath(channelId: string, index: number) {
  return path.join(HTML_DIR, `${channelId}-${index}.html`);
}
```

Also remove `FORCE_HTML_GENERATION` (line 42–44) since the archiver doesn't generate HTML.

**Keep** `HTML_DIR`, `FILES_DIR`, `AVATARS_DIR`, `EMOJIS_DIR` — these are used for downloaded files/avatars/emojis even though "HTML" is a misleading parent dir name. Renaming is a cleanup for a later stage.

- [ ] **Step 6: Fix any compile errors from removed exports**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm build`

If anything imported the removed exports, fix those imports. (Based on the code read, nothing in the archiver uses `INDEX_PATH`, `SEARCH_PATH`, `MESSAGES_JS_PATH`, `SEARCH_TEMPLATE_PATH`, `getHTMLFilePath`, or `FORCE_HTML_GENERATION`.)

- [ ] **Step 7: Commit**

```bash
git add archive/src/config.ts archive/src/__tests__/config.test.ts
git commit -m "feat(archive): unify data path to slack-archive/, support SLACK_ARCHIVE_DATA_DIR env var"
```

---

### Task 5: Fix `fs.statSync().isDirectory` bug in backup.ts

**Files:**
- Modify: `archive/src/utils/backup.ts:156`
- Create: `archive/src/__tests__/backup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `archive/src/__tests__/backup.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";

// We test deleteOlderBackups indirectly by testing the isDirectory check pattern.
// The real function also prompts the user, so we test the fix in isolation.

describe("backup utilities", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
  });

  afterEach(() => {
    fs.removeSync(tmpDir);
  });

  it("fs.statSync().isDirectory() is a method call, not a property", () => {
    // This test documents the bug and verifies the correct pattern.
    // The bug was: const { isDirectory } = fs.statSync(dir)
    // isDirectory is a method on Stats, not a boolean property.
    // Destructuring it gives you the function reference, which is always truthy.
    const testDir = path.join(tmpDir, "test-dir");
    fs.mkdirSync(testDir);
    const testFile = path.join(tmpDir, "test-file.txt");
    fs.writeFileSync(testFile, "hello");

    // Correct pattern: call the method
    const dirStats = fs.statSync(testDir);
    expect(dirStats.isDirectory()).toBe(true);

    const fileStats = fs.statSync(testFile);
    expect(fileStats.isDirectory()).toBe(false);

    // Buggy pattern: destructure gives function reference (always truthy)
    const { isDirectory: buggyDir } = fs.statSync(testDir);
    const { isDirectory: buggyFile } = fs.statSync(testFile);
    expect(typeof buggyDir).toBe("function"); // not a boolean!
    expect(typeof buggyFile).toBe("function"); // not a boolean!
    // Both are truthy — the bug means files are never skipped
    expect(!!buggyDir).toBe(true);
    expect(!!buggyFile).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (it documents existing behavior)**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm test -- src/__tests__/backup.test.ts`

Expected: PASS — the test documents that the destructured value is a function, not a boolean.

- [ ] **Step 3: Fix the bug in `archive/src/utils/backup.ts`**

Replace line 156:

```typescript
            const { isDirectory } = fs.statSync(dir);
            if (!isDirectory) continue;
```

With:

```typescript
            if (!fs.statSync(dir).isDirectory()) continue;
```

- [ ] **Step 4: Verify build still compiles**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm build`

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add archive/src/utils/backup.ts archive/src/__tests__/backup.test.ts
git commit -m "fix(archive): call isDirectory() as method, not destructured property"
```

---

### Task 6: Fix `readFile` bug in data-load.ts

**Files:**
- Modify: `archive/src/utils/data-load.ts:71-75`
- Create: `archive/src/__tests__/data-load.test.ts`

- [ ] **Step 1: Write the failing test**

Create `archive/src/__tests__/data-load.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";

describe("readFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data-load-test-"));
  });

  afterEach(() => {
    fs.removeSync(tmpDir);
  });

  it("reads the file at the given path, not a hardcoded path", async () => {
    const testFile = path.join(tmpDir, "test.txt");
    fs.writeFileSync(testFile, "expected content");

    // Import the function — we're testing that it uses its filePath argument
    const { readFile } = await import("../utils/data-load.js");
    const result = await readFile(testFile);
    expect(result).toBe("expected content");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm test -- src/__tests__/data-load.test.ts`

Expected: FAIL — `readFile` ignores `filePath` and reads `SEARCH_DATA_PATH` (which doesn't exist in the test environment), so it will throw or return wrong content.

- [ ] **Step 3: Fix the bug in `archive/src/utils/data-load.ts`**

Replace lines 71–75:

```typescript
export async function readFile(filePath: string, encoding = "utf8") {
  return retry<string>({ name: `Reading ${filePath}` }, () => {
    return fs.readFileSync(SEARCH_DATA_PATH, "utf8");
  });
}
```

With:

```typescript
export async function readFile(filePath: string) {
  return retry<string>({ name: `Reading ${filePath}` }, () => {
    return fs.readFileSync(filePath, "utf8");
  });
}
```

Two fixes: (1) use `filePath` instead of hardcoded `SEARCH_DATA_PATH`, (2) drop the unused `encoding` parameter since `readFileSync` is always called with `"utf8"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm test -- src/__tests__/data-load.test.ts`

Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm test`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add archive/src/utils/data-load.ts archive/src/__tests__/data-load.test.ts
git commit -m "fix(archive): readFile now uses its filePath argument instead of hardcoded path"
```

---

### Task 7: Clean up backup.ts formatting (apply WIP branch changes)

The `wip/archive-formatting-import-fix` branch has formatting and import-ordering fixes across `archive/src/`. Most of those are now redundant (we've fixed the real bugs). But the consistent 2-space indent and import ordering in `backup.ts` is worth applying since we've already touched the file.

**Files:**
- Modify: `archive/src/utils/backup.ts` (formatting only — already functionally fixed in Task 5)

- [ ] **Step 1: Reformat `archive/src/utils/backup.ts`**

Ensure the file uses consistent 2-space indentation throughout. The current file mixes 4-space and 2-space indentation (compare `retry` function at 4-space with `createBackup` at mixed). Normalize to 2-space to match the rest of `archive/src/`.

Sort imports: `@inquirer/prompts` first, then `fs-extra`, then `path`, then `rimraf`, then `trash`, then local imports.

The full file after formatting (incorporating the Task 5 bug fix):

```typescript
import { confirm } from "@inquirer/prompts";
import fs from "fs-extra";
import path from "path";
import { rimraf } from "rimraf";
import trash from "trash";

import { AUTOMATIC_MODE, DATA_DIR, NO_BACKUP, OUT_DIR } from "../config.js";
import { logger } from "./logger.js";

export interface RetryOptions {
  retries: number;
  name?: string;
}

const defaultOptions: RetryOptions = {
  retries: 3,
};

export async function retry<T>(
  options: Partial<RetryOptions>,
  operation: () => T,
  attempt = 0
): Promise<T> {
  const mergedOptions = { ...defaultOptions, ...options };

  try {
    return operation();
  } catch (error) {
    if (attempt >= mergedOptions.retries) {
      throw error;
    }

    const ms = 250 + attempt * 250;

    if (mergedOptions.name) {
      logger.warn(`Operation "${options.name}" failed, retrying in ${ms}ms`);
    }

    await wait(ms);

    return retry(options, operation, attempt + 1);
  }
}

function wait(ms = 250) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function createBackup(backupDir: string) {
  logger.debug("Creating backup");
  if (NO_BACKUP) {
    logger.info("Skipping backup creation due to NO_BACKUP flag.");
    return;
  }
  if (!fs.existsSync(DATA_DIR)) {
    logger.info("No data directory found. Skipping backup creation.");
    return;
  }

  const hasFiles = fs.readdirSync(DATA_DIR);

  if (hasFiles.length === 0) {
    logger.info("Data directory is empty. Skipping backup creation.");
    return;
  }

  logger.info(`Existing data directory found. Creating backup: ${backupDir}`);

  await fs.copy(DATA_DIR, backupDir);

  logger.info(`Backup created.`);
}

export async function deleteBackup(backupDir: string) {
  if (!fs.existsSync(backupDir)) {
    return;
  }

  logger.info(
    `Cleaning up backup: If anything went wrong, you'll find it in your system's trash.`
  );

  try {
    await trash(backupDir);
    return;
  } catch (error) {
    logger.error("Moving backup to trash failed.", { error });
  }

  if (!process.env["TRASH_HARDER"]) {
    logger.info(`Set TRASH_HARDER=1 to delete files permanently.`);
    return;
  }

  try {
    await rimraf(backupDir);
  } catch (error) {
    logger.error(`Deleting backup permanently failed. Aborting here.`, {
      error,
    });
  }
}

export async function deleteOlderBackups() {
  try {
    const oldBackupNames: Array<string> = [];
    const oldBackupPaths: Array<string> = [];

    for (const entry of fs.readdirSync(OUT_DIR)) {
      const isBackup = entry.startsWith("data_backup_");
      if (!isBackup) continue;

      const dir = path.join(OUT_DIR, entry);
      if (!fs.statSync(dir).isDirectory()) continue;

      oldBackupPaths.push(dir);
      oldBackupNames.push(entry);
    }

    if (oldBackupPaths.length === 0) return;

    if (AUTOMATIC_MODE) {
      logger.info(
        `Found existing older backups, but in automatic mode: Proceeding without deleting them.`
      );
      return;
    }

    const del = await confirm({
      default: true,
      message: `We've found existing backups (${oldBackupNames.join(
        ", "
      )}). Do you want to delete them?`,
    });

    if (del) {
      oldBackupPaths.forEach((v) => fs.removeSync(v));
      logger.info(`Deleted old backups: ${oldBackupNames.join(", ")}`);
    }
  } catch (error) {
    logger.error("Error while deleting older backups", { error });
  }
}
```

- [ ] **Step 2: Run all tests**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm test`

Expected: All tests pass.

- [ ] **Step 3: Verify build**

Run: `cd /home/danlavoie/git/slack-archive/archive && pnpm build`

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add archive/src/utils/backup.ts
git commit -m "chore(archive): normalize backup.ts to 2-space indent and sorted imports"
```

---

### Task 8: Smoke test — run the archiver against a real workspace

This is a manual verification task. It requires a valid `SLACK_TOKEN`.

**Files:** None modified.

- [ ] **Step 1: Run the archiver in automatic mode**

Run from the **repo root** (important — the archiver uses `process.cwd()` for `BASE_DIR`):

```bash
cd /home/danlavoie/git/slack-archive
SLACK_TOKEN=xoxp-your-token-here pnpm --filter @slack-archive/archiver start -- --automatic
```

If you don't have a token handy, you can also place it in `slack-archive/.token`.

Expected: The archiver authenticates, downloads channels, messages, threads, emojis, avatars, files, builds a search index, and exits 0. Output appears under `slack-archive/data/`.

- [ ] **Step 2: Verify the output directory structure**

Run: `ls -la slack-archive/data/`

Expected: Files present:
- `channels.json` — array of channel objects
- `users.json` — record of user objects keyed by user ID
- `emojis.json` — record of emoji names to URLs
- `search-index.json` — search index
- `slack-archive.json` — archive metadata (channels downloaded, auth info)
- `<channelId>.json` — one per channel, containing message arrays
- `.last-successful-run` — ISO date string

Run: `ls slack-archive/html/`

Expected: directories `avatars/`, `emojis/`, `files/` with downloaded content.

- [ ] **Step 3: Verify search index is valid JSON**

Run: `python3 -m json.tool slack-archive/data/search-index.json > /dev/null && echo "Valid JSON"`

Expected: `Valid JSON`

- [ ] **Step 4: Verify the archiver is idempotent (incremental)**

Run the same command again:

```bash
cd /home/danlavoie/git/slack-archive
SLACK_TOKEN=xoxp-your-token-here pnpm --filter @slack-archive/archiver start -- --automatic
```

Expected: Runs faster the second time (skips already-downloaded content for archived/completed channels), exits 0. No data corruption — existing files are preserved and extended, not overwritten.

---

## Notes for Later Stages

These are **not bugs to fix now** but observations to carry forward:

1. **Search index shape mismatch.** `archive/src/search.ts:createSearchIndex` writes a flat `Record<string, {text, file, ts}>`. The `SearchFile` type in `interfaces.ts` expects `{users, channels, messages, pages}`. The backend's `getSearchFile` in `data-load.ts` tries to parse the legacy JS format (`contents.slice(21, ...)`). This will all need reconciling in Stage 2/3 when the frontend consumes the search data.

2. **`getSearchFile` reads `search.js` but `createSearchIndex` writes `search-index.json`.** Different filenames, different formats. The backend's data-load reads the legacy format; the archiver writes a new format. Reconcile in Stage 2.

3. **The `downloadEachChannel` / `downloadChannel` functions in `slack.ts`** are dead code — `cli.ts:main()` inlines the same logic. They can be deleted in a cleanup pass but are harmless for now.

4. **`config.ts` still exports `HTML_DIR`, `FILES_DIR`, `AVATARS_DIR`, `EMOJIS_DIR`** nested under `OUT_DIR/html/`. The "html" in the path is a legacy artifact — files, avatars, and emojis are static assets, not HTML. Renaming is a cleanup concern for Stage 3 or later.

5. **`trash` dependency** doesn't work on most Linux distros (comment in backup.ts:119). In a Docker container, it will always fail, falling through to the `TRASH_HARDER` / `rimraf` path. Stage 5 (backup rotation) should simplify this to just use `rimraf` directly since we're targeting a container environment.
