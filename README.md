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
