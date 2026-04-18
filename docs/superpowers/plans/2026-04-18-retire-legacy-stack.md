# Retire Legacy Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy monolith code and documentation, leaving only the new split architecture (`archive/`, `backend/`, `frontend/`, `packages/`).

**Architecture:** Delete legacy source directories and files, clean up `.gitignore` / `.dockerignore` entries that reference deleted content, rewrite `README.md` to document only the new architecture, and update `CLAUDE.md` to remove dual-codebase framing.

**Tech Stack:** Git, Markdown

---

## File Structure

**Delete (14 items):**
- `src/` — legacy monolith TypeScript source (30 files)
- `bin/` — legacy CLI entry point (`slack-archive.js`)
- `static/` — legacy static HTML assets (CSS, fonts, search page)
- `lib/` — compiled JS output from legacy `src/`
- `package.legacy.json` — legacy Yarn/npm package config
- `yarn.lock` — legacy Yarn lockfile
- `tsconfig.json` (root) — legacy TS config (outDir `./lib`, TS 4.7)
- `exec_archive.sh` — legacy automation script
- `backup.sh` — deprecated legacy backup script
- `cleanup.sh` — deprecated legacy rotation script
- `archive-nginx.conf` — legacy nginx config
- `.npmignore` — legacy npm publish config
- `.node-version` — stale Node 16.4.0 pinning
- `TODO.md` — superseded by `docs/rebuild-plan.md`

**Modify (4 items):**
- `README.md` — rewrite for new architecture only
- `CLAUDE.md` — remove legacy monolith section, update to single-architecture framing
- `.gitignore` — remove entries referencing deleted legacy files
- `.dockerignore` — remove entries referencing deleted legacy files

---

### Task 1: Delete legacy source code and build output

**Files:**
- Delete: `src/` (entire directory)
- Delete: `bin/` (entire directory)
- Delete: `static/` (entire directory)
- Delete: `lib/` (entire directory)

- [ ] **Step 1: Verify the directories exist and are tracked**

Run:

```bash
git ls-files src/ bin/ static/ lib/ | wc -l
```

Expected: a positive count of tracked files.

- [ ] **Step 2: Remove the directories**

```bash
git rm -r src/ bin/ static/ lib/
```

- [ ] **Step 3: Verify removal**

Run:

```bash
ls src/ bin/ static/ lib/ 2>&1
```

Expected: all four should report "No such file or directory".

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(stage8): remove legacy monolith source (src/, bin/, static/, lib/)"
```

---

### Task 2: Delete legacy config and tooling files

**Files:**
- Delete: `package.legacy.json`
- Delete: `yarn.lock`
- Delete: `tsconfig.json` (root)
- Delete: `exec_archive.sh`
- Delete: `backup.sh`
- Delete: `cleanup.sh`
- Delete: `archive-nginx.conf`
- Delete: `.npmignore`
- Delete: `.node-version`
- Delete: `TODO.md`

- [ ] **Step 1: Verify the files exist and are tracked**

Run:

```bash
git ls-files package.legacy.json yarn.lock tsconfig.json exec_archive.sh backup.sh cleanup.sh archive-nginx.conf .npmignore .node-version TODO.md
```

Expected: all 10 files listed.

- [ ] **Step 2: Remove the files**

```bash
git rm package.legacy.json yarn.lock tsconfig.json exec_archive.sh backup.sh cleanup.sh archive-nginx.conf .npmignore .node-version TODO.md
```

- [ ] **Step 3: Verify removal**

Run:

```bash
ls package.legacy.json yarn.lock tsconfig.json exec_archive.sh backup.sh cleanup.sh archive-nginx.conf .npmignore .node-version TODO.md 2>&1
```

Expected: all report "No such file or directory".

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(stage8): remove legacy config and tooling files"
```

---

### Task 3: Clean up .gitignore

**Files:**
- Modify: `.gitignore`

The current `.gitignore` has entries that reference legacy files. After deletion, some entries become unnecessary or confusing.

- [ ] **Step 1: Edit `.gitignore`**

Replace the entire file with:

```gitignore
node_modules
.DS_Store
*.log
.token
.env

# Build output
archive/dist/
backend/dist/
frontend/dist/
packages/types/dist/

# Editor / tool settings
.claude/
.superpowers/
.vscode/

# Runtime
logs/

# Archive data (local snapshots, merge outputs)
data/
merged-archive/
backups/
slack-archive/
```

Changes from previous version:
- Removed `out` (legacy build output concept)
- Removed `lib` (legacy tsc output — directory is now deleted)
- Removed the "Orphaned prototypes" section (`src/config.js`, `src/data-load.js`, `src/interfaces.js`, `src/retry.js`) — `src/` is deleted entirely
- Added `slack-archive/` (the legacy runtime output dir, already was listed but now it's in the data section for clarity)

- [ ] **Step 2: Verify no new untracked files appear**

Run:

```bash
git status
```

Expected: only `.gitignore` shows as modified. No previously-ignored files should suddenly appear as untracked (since the directories they were in have been deleted).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore(stage8): clean up .gitignore after legacy removal"
```

---

### Task 4: Clean up .dockerignore

**Files:**
- Modify: `.dockerignore`

- [ ] **Step 1: Edit `.dockerignore`**

Replace the entire file with:

```dockerignore
# VCS + editor
.git
.gitignore
.vscode
.claude
.superpowers

# Node modules — always reinstalled inside image
node_modules
**/node_modules

# Build outputs — always rebuilt inside image
**/dist
**/out

# Existing data / backups / config from host
slack-archive/
data/
backups/
config/

# Test artifacts
test-results/
coverage/
**/*.log
.token

# Env files
.env
.env.*
!.env.example

# Docs (not needed at runtime — keeps layers small)
docs/
*.md
```

Changes from previous version:
- Removed `**/lib` (no more lib/ output)
- Removed the "Legacy monolith" section (`src/`, `bin/`, `static/`, `yarn.lock`, `exec_archive.sh`, `backup.sh`, `cleanup.sh`, `archive-nginx.conf`, `Dockerfile`) — all deleted
- Removed `slack-archive-new/` and `slack-archive-backup/` and `archive/slack-archive/` (legacy data path concepts that no longer exist)

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore(stage8): clean up .dockerignore after legacy removal"
```

---

### Task 5: Rewrite README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README.md with new-architecture-only content**

Write the following content to `README.md`:

```markdown
# Slack Archive

A self-hosted Slack workspace archive. Downloads messages, files, avatars, and emoji from the Slack API, stores them as JSON, and serves a browsable web UI.

## Architecture

```
archive/    → @slack-archive/archiver   CLI that downloads Slack data
backend/    → @slack-archive/server     Express API serving archive data
frontend/   → @slack-archive/web        Vite + React 19 SPA
packages/   → @slack-archive/types      Shared Zod schemas and TypeScript types
```

Two container images, wired together by `docker-compose.yml`:

- **archiver** — one-shot CLI invoked on a schedule. Downloads messages, files, avatars, emoji, and builds a search index. Exits when done.
- **web** — long-running Express server that serves both the REST API (`/api/*`) and the built frontend SPA on a single port.

The two containers share state through a bind-mounted `data/` directory.

## Quick start (Docker)

```bash
cp .env.example .env
# Set SLACK_TOKEN in .env, or place a .token file in ./config/
mkdir -p data backups config

docker compose build
docker compose up -d web              # start the web UI on http://localhost:3100
docker compose run --rm archiver      # run one archive pass
```

The `archiver` service uses `profiles: ["archive"]`, so `docker compose up -d` starts only the web container. Run the archiver explicitly with `docker compose run --rm archiver`.

## Quick start (local dev)

Requires Node >= 22 and pnpm.

```bash
pnpm install          # install all workspace dependencies
pnpm -r build         # build all packages
```

Then, in separate terminals:

```bash
# Terminal 1 — run the archiver once
cd archive && pnpm start -- --automatic

# Terminal 2 — start the backend API
cd backend && pnpm dev

# Terminal 3 — start the frontend dev server
cd frontend && pnpm dev
```

| Package    | Install  | Dev               | Build        | Test        |
|------------|----------|-------------------|--------------|-------------|
| archive/   | pnpm i   | pnpm start        | pnpm build   | pnpm test   |
| backend/   | pnpm i   | pnpm dev          | pnpm build   | —           |
| frontend/  | pnpm i   | pnpm dev (Vite)   | pnpm build   | —           |

## Getting a Slack token

You need a Slack **user token** (`xoxp-...`) with these scopes:

- `channels:history`, `channels:read`
- `groups:history`, `groups:read`
- `im:history`, `im:read`
- `mpim:history`, `mpim:read`
- `files:read`, `remote_files:read`
- `users:read`

### Steps

1. Go to https://api.slack.com/apps and **Create New App** → **From scratch**.
2. Under **OAuth & Permissions**, add a redirect URL (e.g., `https://notarealurl.com/`).
3. Add the user token scopes listed above.
4. From **Basic Information**, note your **client ID** and **client secret**.
5. In a browser, open:
   ```
   https://{your-team}.slack.com/oauth/authorize?client_id={client-id}&scope=client
   ```
6. Authorize the app. You'll be redirected to your redirect URL with a `?code=` parameter — copy it.
7. Exchange the code for a token:
   ```
   https://{your-team}.slack.com/api/oauth.access?client_id={client-id}&client_secret={client-secret}&code={code}
   ```
8. The response JSON contains your token. Set it as `SLACK_TOKEN` in `.env` or save it to `config/.token`.

## UnRAID deployment

See [`unraid/README.md`](unraid/README.md) for deployment instructions using UnRAID Docker templates.

Published images:
- `ghcr.io/danrlavoie/slack-archive-web:latest`
- `ghcr.io/danrlavoie/slack-archive-archiver:latest`

## Merge scripts

One-shot scripts for merging a legacy slack-archive dataset with the new format live in `archive/src/scripts/`:

```bash
cd archive && npx tsx src/scripts/merge-legacy.ts <legacy-root> <new-data-dir> <output-dir>
```

See `docs/superpowers/specs/2026-04-18-legacy-data-merge-design.md` for details.
```

- [ ] **Step 2: Review the README**

Read through the written file to verify:
- No references to legacy monolith (`yarn`, `npx slack-archive`, static HTML, `src/cli.ts`)
- No references to deleted files (`exec_archive.sh`, `backup.sh`, `cleanup.sh`, `archive-nginx.conf`)
- Docker section matches current `docker-compose.yml`
- Token instructions are complete

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(stage8): rewrite README for new architecture only"
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace CLAUDE.md with single-architecture content**

Write the following content to `CLAUDE.md`:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

This repo is a pnpm workspace containing a self-hosted Slack archive system.

```
archive/    → @slack-archive/archiver   CLI that downloads Slack data
backend/    → @slack-archive/server     Express API serving archive data
frontend/   → @slack-archive/web        Vite + React 19 SPA
packages/   → @slack-archive/types      Shared Zod schemas and TypeScript types
```

All packages use pnpm, TypeScript 5.8, and Node >= 22.

Commands (run inside the respective subdirectory, or use `pnpm -r` from root):

| Project    | Install       | Dev                             | Build          | Test         |
|------------|---------------|---------------------------------|----------------|--------------|
| `archive/` | `pnpm i`      | `pnpm start`                    | `pnpm build`   | `pnpm test`  |
| `backend/` | `pnpm i`      | `pnpm dev` (port 3100)          | `pnpm build`   | —            |
| `frontend/`| `pnpm i`      | `pnpm dev` (Vite)               | `pnpm build`   | —            |

## How the pieces connect

1. **`archive/`** authenticates to Slack (via `SLACK_TOKEN` env var or `config/.token` file), downloads channels / messages / threads / files / avatars / emojis, writes JSON under `<OUT_DIR>/data/`, builds a search index, and manages timestamped backups. The output directory defaults to `slack-archive/` relative to `process.cwd()`, overridden by `ARCHIVE_OUT_DIR` env var.
2. **`backend/`** serves a REST API (`/api/channels`, `/api/messages/:channelId`, `/api/users`, `/api/emoji`, `/api/emoji/:name`, `/api/search`) by reading JSON from a data directory. Defaults to `../../slack-archive/data` relative to `backend/src/`, overridden by `ARCHIVE_DATA_DIR` env var.
3. **`frontend/`** is a SPA with channel sidebar and message rendering. Fetches from the backend via `src/api/slack.ts` using axios + TanStack Query. Styling is SCSS under `src/styles/`.

## Shared types

`packages/types/` (`@slack-archive/types`) provides Zod schemas as the source of truth for shared types. All packages depend on it via `workspace:*`. Types like `Channel`, `User`, `Message`, `ArchiveMessage`, `Emojis`, and `SlackArchiveData` are defined there.

## Authentication

The archiver accepts a Slack user token via (in order):
1. `SLACK_TOKEN` env var
2. `.token` file in the config directory (`<OUT_DIR>/config/.token`)
3. Interactive prompt

See the root README for the full token-creation flow.

## Docker

Two container images, wired by `docker-compose.yml` at the repo root:
- **archiver** — one-shot CLI (restart: no). Dockerfile: `docker/archiver.Dockerfile`.
- **web** — Express + static SPA (restart: unless-stopped). Dockerfile: `docker/web.Dockerfile`.

Both mount `data/`, `backups/`, and `config/` from the host.

## Notes when editing

- The archive CLI expects to be invoked from the repo root (it uses `process.cwd()` for `BASE_DIR` — see `archive/src/config.ts`). Running it from elsewhere will create output directories in the wrong place.
- All packages use ESM (`"type": "module"`). Use `import.meta.url`-based patterns, never `require.main === module`.
- The `archive/` package has Vitest tests under `src/**/__tests__/`. Run with `pnpm test`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(stage8): update CLAUDE.md for single-architecture codebase"
```

---

### Task 7: Update rebuild-plan.md to mark Stage 8 complete

**Files:**
- Modify: `docs/rebuild-plan.md:327-335`

- [ ] **Step 1: Mark Stage 8 as complete**

In `docs/rebuild-plan.md`, change the Stage 8 header from:

```markdown
### Stage 8 — Retire the legacy stack
```

to:

```markdown
### Stage 8 — Retire the legacy stack  *(COMPLETE — 2026-04-18)*
```

- [ ] **Step 2: Verify all stages are marked complete**

Read `docs/rebuild-plan.md` and verify stages 0–8 all show completion status.

- [ ] **Step 3: Commit**

```bash
git add docs/rebuild-plan.md
git commit -m "docs: mark Stage 8 complete"
```

---

### Task 8: Final verification

- [ ] **Step 1: Verify no legacy references remain in tracked files**

Run:

```bash
git grep -l 'yarn install\|yarn prepublishOnly\|npx slack-archive\|yarn\.lock\|exec_archive\|backup\.sh\|cleanup\.sh\|archive-nginx' -- ':!docs/superpowers/' ':!docs/rebuild-plan.md'
```

Expected: no output (no files reference legacy tooling outside of historical docs).

- [ ] **Step 2: Verify the workspace still builds**

Run:

```bash
pnpm -r build
```

Expected: all packages compile successfully.

- [ ] **Step 3: Verify tests pass**

Run:

```bash
cd archive && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Verify git status is clean**

Run:

```bash
git status
```

Expected: clean working tree, nothing untracked (except gitignored runtime dirs).
