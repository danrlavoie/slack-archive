# Merging the Pre-Retention-Policy Archive

## Background

The old archive at `~/Documents/slack-archive/slack-archive` contains the full
Slack workspace history (2019-08-15 through 2025-08-15), including ~84k messages
in #general alone. The newer archive captures only what Slack still serves after
their retention policy kicked in (~11k messages in #general, 2025-02 onward).

There is a 4,590-message overlap window where both archives have the same
messages (identified by matching `ts` values). The archiver deduplicates by `ts`
when merging, so duplicates are not a concern.

## What you gain

| Channel            | Old only | Overlap | New only | Combined |
|--------------------|----------|---------|----------|----------|
| general            | 79,713   | 4,590   | 6,768    | 91,071   |
| lara-general       | ~5,268   | ...     | ...      | ~7,097+  |
| shopping-list      | ~626     | ...     | ...      | ~755+    |
| recipes            | ~748     | ...     | ...      | ~810+    |
| n-s-f-w            | ~489     | ...     | ...      | ~548+    |
| city_research      | ~53      | ...     | ...      | ~1,071+  |
| *(all others)*     | varies   | ...     | ...      | ...      |

## Prerequisites

- The old archive is at `~/Documents/slack-archive/slack-archive`
- You have a separate backup of the old archive (you've confirmed this exists)
- `$SLACK_TOKEN` is available (via `source ~/.env`)
- The archiver builds: `cd archive && pnpm build` succeeds

## Data compatibility (verified 2026-04-12)

- Message JSON shape: identical keys (`blocks`, `client_msg_id`, `team`, `text`, `ts`, `type`, `user`)
- `users.json`: same 7 users, same keyed-by-ID object format
- `channels.json`: same array-of-channel-objects format (old has 18, new has 19 — `house-nonsense` is new)
- `emojis.json`: same key-to-URL format, same 34 entries
- `slack-archive.json`: same `{auth, channels}` metadata shape

## Step-by-step

### 1. Verify your backup exists

```bash
ls ~/Documents/slack-archive/slack-archive/data/channels.json
# Should exist. If not, stop — wrong path.
```

### 2. Prepare the merge target

The archiver writes to `$CWD/slack-archive/` by default. We'll set up a fresh
merge directory under `archive/` so nothing touches the original.

```bash
cd ~/git/slack-archive

# Create the target data directory
mkdir -p archive/slack-archive/data

# Copy old message data (the big win — all the pre-retention messages)
cp ~/Documents/slack-archive/slack-archive/data/*.json \
   archive/slack-archive/data/

# Copy old file attachments, avatars, and emojis into the new layout.
# The old archive stored these under html/; the new architecture
# expects them under data/.
cp -rn ~/Documents/slack-archive/slack-archive/html/files \
       archive/slack-archive/data/files
cp -rn ~/Documents/slack-archive/slack-archive/html/avatars \
       archive/slack-archive/data/avatars
cp -rn ~/Documents/slack-archive/slack-archive/html/emojis \
       archive/slack-archive/data/emojis
```

### 3. Run the archiver

```bash
source ~/.env   # loads SLACK_TOKEN
cd ~/git/slack-archive/archive
pnpm start -- --automatic
```

What happens:
- The archiver sees existing `channels.json` in `archive/slack-archive/data/`
- For each channel, it loads existing messages from disk
- It calls the Slack API with `oldest` set to the most recent existing message timestamp — so it only fetches **newer** messages
- It deduplicates by `ts` (`uniqBy(result, "ts")`) and writes the combined set
- `channels.json`, `users.json`, `emojis.json` are merged (new data wins on conflict)
- Any new file attachments, avatars, and emojis are downloaded
- A new `search-index.json` is built from the full combined message set

### 4. Verify the merge

```bash
# Check message counts — general should be ~91k
python3 -c "
import json
msgs = json.load(open('slack-archive/data/CL0AVQ3T3.json'))
print(f'general: {len(msgs)} messages')
ts = sorted(float(m['ts']) for m in msgs)
from datetime import datetime
print(f'range: {datetime.fromtimestamp(ts[0]):%Y-%m-%d} to {datetime.fromtimestamp(ts[-1]):%Y-%m-%d}')
"

# Spot-check: should see 19 channels
python3 -c "
import json
ch = json.load(open('slack-archive/data/channels.json'))
print(f'{len(ch)} channels')
"
```

### 5. Point the backend at the merged data

Either move the merged data into place:

```bash
# From repo root
rm -rf slack-archive/data
cp -r archive/slack-archive/data slack-archive/data
```

Or point the backend at the archiver output directly:

```bash
ARCHIVE_DATA_DIR=../archive/slack-archive/data cd backend && pnpm dev
```

## What could go wrong

**Slack API errors during fetch**: The archiver retries failed operations. If it
crashes mid-run, the old data is still intact on disk — just re-run.

**Duplicate messages**: Shouldn't happen — `uniqBy(result, "ts")` handles this.
If you want to verify: count messages before and after, the total should equal
old-unique + new-unique (no inflation).

**Missing file attachments**: Files from old messages that Slack has since deleted
from their CDN won't re-download. But you already have them from the old archive
(copied in step 2). The `cp -rn` (no-clobber) ensures old files aren't
overwritten by failed re-download attempts.

**Shape drift over time**: If you run this much later than 2026-04-12, the Slack
API response shapes may have changed. Run `pnpm build` in `archive/` first — if
it compiles, the types still match.
