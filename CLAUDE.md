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
