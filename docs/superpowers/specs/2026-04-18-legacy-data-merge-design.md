# Legacy Data Merge

## Goal

Incorporate the legacy slack-archive dataset (84k+ messages, 2,801 files, pre-retention data) into the new archive format via a one-shot merge script, producing a unified dataset that the archiver CLI can run against incrementally going forward.

## Context

Two independent archive snapshots exist:

| Source | Location | Layout |
|--------|----------|--------|
| Legacy | `~/Documents/slack-archive/slack-archive/` | JSONs in `data/`, static assets in `html/{files,avatars,emojis}/` |
| New snapshot | `repo/data/` | JSONs and static assets all under `data/` (files/, avatars/, emojis/ alongside channel JSONs) |

Both use the same message format (confirmed: overlapping messages are byte-identical). The legacy archive contains ~69k messages not present in the new snapshot (pre-Slack-retention data). The new snapshot contains ~7k messages and one channel (C09KRJW03E0) not in legacy.

The output must follow the new archive layout (everything under a single directory), since that's what the archiver CLI, backend, and frontend expect.

## Workflow

0. Create a working directory for the merge output.
1. Copy legacy data into the working directory (never mutate the original).
2. Run the merge script, combining legacy + new snapshot into the working directory.
3. Run the archiver CLI (`--automatic`) pointed at the working directory to fetch any messages newer than both snapshots.
4. Smoke test: run backend + frontend against the merged data.
5. Smoke test: run archiver again, confirm it only appends new messages.
6. Copy the merged dataset to the UnRAID server as the new production archive.

Steps 0-2 are what the merge script automates. Steps 3-6 are manual.

## Merge Script

### Location

`archive/src/scripts/merge-legacy.ts`

Single file. No new dependencies beyond what `archive/` already has (`fs-extra`, `lodash-es`). Uses types from `@slack-archive/types`.

### Invocation

```bash
cd archive
pnpm tsx src/scripts/merge-legacy.ts \
  ~/Documents/slack-archive/slack-archive \
  ../data \
  ../merged-archive
```

Arguments:
1. **Legacy root** — the top-level legacy archive directory. Script reads JSONs from `<root>/data/` and static assets from `<root>/html/{files,avatars,emojis}/`.
2. **New data directory** — the new-style data directory where JSONs and static asset subdirectories live side by side.
3. **Output directory** — must not already exist (safety check). Receives the merged dataset in new-style layout. This becomes the archive's `OUT_DIR` — the script creates a `data/` subdirectory inside it containing all JSONs and static asset directories. To run the archiver against this output: `ARCHIVE_OUT_DIR=../merged-archive pnpm start -- --automatic`.

### Channel Message Merge

For each channel file (`[CD]*.json`) present in either source:

1. Load both arrays (empty array if channel doesn't exist in one source).
2. Build a `Map<string, message>` keyed by `ts`.
3. Insert all legacy messages first, then all new messages. New overwrites legacy on `ts` collision.
4. For each collision: compare the two messages. If not identical, log a warning with field-level diff (which keys differ, old value, new value).
5. Sort the final array by `ts` ascending (oldest first).
6. Write to `<output>/data/[channelId].json`.

### Metadata File Merge

| File | Format | Merge strategy |
|------|--------|---------------|
| `channels.json` | `Channel[]` | Deduplicate by `.id`, prefer new |
| `users.json` | `Record<string, User>` | Object spread, new wins on key conflict |
| `emojis.json` | `Record<string, string>` | Object spread, new wins on key conflict |
| `slack-archive.json` | `{ channels: Record<string, { messages, fullyDownloaded? }> }` | Merge channel records (new wins per key), then recalculate `messages` counts from actual merged channel file lengths |

### Static Asset Copy

For `files/`, `avatars/`, `emojis/` directories:

- Copy all files from legacy (`<legacy-root>/html/{files,avatars,emojis}/`) into output.
- Copy all files from new (`<new-data-dir>/{files,avatars,emojis}/`) into output, overwriting any legacy file with the same path.
- `files/` are organized by channel ID subdirectory, then file ID as filename. No conflicts expected between sources since file IDs are globally unique, but "new wins" applies if there is one.

### What the Script Does NOT Do

- No Slack API calls.
- No search index generation (archiver rebuilds this on next run).
- No `.last-successful-run` file (archiver sets this on next run).
- No backup management.

### Output Summary

After completion, the script prints:

```
Channel CL0AVQ3T3: 90,523 messages (69,042 legacy-only, 6,920 new-only, 15,261 overlap, 3 conflicts logged)
Channel CKV9F72PM: 755 messages (445 legacy-only, 0 new-only, 310 overlap, 0 conflicts logged)
...
Total: X messages across Y channels, Z conflicts logged
Files: A copied (B from legacy, C from new)
Avatars: D copied
Emojis: E copied
```

### Diff Logging Format

```
WARN: CL0AVQ3T3 ts=1755098253.477519 differs:
  text: "old value..." → "new value..."
  edited: undefined → {"user":"U...","ts":"1755099000.000000"}
```

Conflicts are expected to be message edits that occurred between snapshot dates. "New wins" is the correct behavior for these.

### Error Handling

- If legacy or new directory doesn't exist or is unreadable: exit with error, no partial writes.
- If output directory already exists: exit with error (prevents accidental re-merge into existing data).
- If a channel JSON is malformed: exit with error, log which file.
- Static asset copy failures (permission, disk space): exit with error after logging which file failed.

## Validation Criteria

1. Every message from legacy appears in the output (by `ts`).
2. Every message from the new snapshot appears in the output (by `ts`).
3. No duplicate `ts` values within any channel file.
4. Conflict log is reviewable and contains only expected edits.
5. All static assets from both sources are present in output.
6. Archiver CLI can run against the output directory and append new messages without data loss.
7. Backend + frontend can serve the merged data without errors.
