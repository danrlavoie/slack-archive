# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

This repo contains **two coexisting implementations** of the same "export Slack workspace" tool. Know which one you're editing before making changes.

### 1. Legacy monolith (root `src/`, `bin/`, `static/`, `package.json`)

The original `slack-archive` npm package by Felix Rieseberg. It fetches Slack data *and* generates fully static HTML output (no server, no React runtime). Main entry: `src/cli.ts`; HTML generation: `src/create-html.tsx` (React SSR → static files in `static/`).

- Install/build: `yarn install && yarn prepublishOnly` (runs `tsc`)
- Run: `npx slack-archive` (interactive) or `npx slack-archive --automatic`
- Dev iteration: `yarn cli` (ts-node), `yarn html`, `yarn watch`
- Output directory: `slack-archive/` at repo root (data + html + avatars + files + emojis)

CLI flags live in the root README and in `src/config.ts` — `--automatic`, `--use-previous-channel-config`, `--channel-types`, `--exclude-channels`, `--no-backup`, `--no-search`, `--no-file-download`, `--no-slack-connect`, `--force-html-generation`.

### 2. New split architecture (`archive/`, `backend/`, `frontend/`)

An in-progress rewrite that separates concerns into three independent packages. Each has its own `package.json` / `pnpm-lock.yaml` / `tsconfig.json` — they are **not** a workspace; install and run each subproject independently.

```
archive/   → CLI-only archiver + search indexer (no HTML generation)
backend/   → Express API server that reads archive data from disk
frontend/  → Vite + React 19 + React Router + TanStack Query SPA
```

Commands (run inside the respective subdirectory):

| Project    | Install       | Dev                             | Build          |
|------------|---------------|---------------------------------|----------------|
| `archive/` | `pnpm i`      | `pnpm start` (ts-node src/cli.ts) | `pnpm build` (tsc) |
| `backend/` | `pnpm i`      | `pnpm dev` (ts-node ESM loader on `src/server.ts`, port 3100) | `pnpm build`   |
| `frontend/`| `pnpm i`      | `pnpm dev` (Vite)               | `pnpm build` (`tsc -b && vite build`) |
| `frontend/`| —             | `pnpm lint` (eslint)            | `pnpm preview` |

Neither project has a test runner wired up — `npm test` is a placeholder.

## How the pieces connect (new architecture)

1. **`archive/`** authenticates to Slack (via `SLACK_TOKEN` env var or prompted `.token` file), downloads channels / messages / threads / files / avatars / emojis, writes JSON under `slack-archive-new/data/` (see `archive/src/config.ts`), builds a search index, and manages timestamped backups of the data dir.
2. **`backend/`** (`backend/src/server.ts`) serves a small REST API (`/api/channels`, `/api/messages/:channelId`, `/api/users`, `/api/emoji`, `/api/emoji/:name`, `/api/search`) by reading JSON from `slack-archive/data/` **relative to the backend package** (`../../slack-archive/data` — see `backend/src/config.ts`). Note the path mismatch: the archiver currently writes to `slack-archive-new/`, but the backend reads from `slack-archive/`. This is a known in-progress inconsistency — verify expected paths when changing data-on-disk behavior.
3. **`frontend/`** is a SPA with routes `/` (ChannelSidebar) and `/channels/:channelId` (ChannelView). It fetches from the backend via `src/api/slack.ts` using axios + TanStack Query. Styling is SCSS under `src/styles/`.

### Shared types — not yet shared

`TODO.md` describes a planned `@slack-archive/types` package. It does **not** exist yet. Today, each of `archive/`, `backend/`, and `frontend/` has its own type definitions (often re-deriving Slack API response shapes from `@slack/web-api`). When adding types, check whether the TODO has been actioned before creating yet another copy.

## Authentication

Both implementations accept a Slack user token via (in order):
1. `SLACK_TOKEN` env var
2. `.token` file inside the output data directory
3. Interactive prompt

See the root README for the full token-creation flow (custom Slack app, OAuth scopes, exchanging the authorization code).

## Automation scripts (root)

- `exec_archive.sh` — loads nvm, cd's to repo, runs `npx slack-archive --automatic`. Requires `SLACK_TOKEN` in env. Designed to run from cron.
- `backup.sh` — copies the current `slack-archive/` output into `$HOME/slack-archive/slack-archive-YYYY-MM-DD`.
- `cleanup.sh` — deletes the oldest backup once 8+ backups exist.
- `archive-nginx.conf` + README "Hosting with nginx" section describe serving the generated static archive via nginx.

All three scripts target the **legacy** output under `slack-archive/`, not the new `archive/` package.

## Notes when editing

- The legacy `src/` uses Yarn + older Node (React 17, TS 4.7, `@slack/web-api` v6). The new subprojects use pnpm + modern stacks (React 19, TS 5.8, `@slack/web-api` v7). Don't cross-pollinate dependency versions.
- The archive CLI expects to be invoked from the repo root (it uses `process.cwd()` for `BASE_DIR` — see `archive/src/config.ts`). Running it from elsewhere will create output directories in the wrong place.
- `archive/src/cli.ts` uses `require.main === module` for the entrypoint check even though the package is `"type": "module"` — this is a known bug in ESM context; if running it fails, that's a likely culprit.
