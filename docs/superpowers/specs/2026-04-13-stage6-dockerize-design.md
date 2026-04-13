# Stage 6: Dockerize — Design

**Status:** Draft, 2026-04-13. Ready for user review.
**Branch:** `refactor/rebuild-plan`
**Supersedes:** None. Refines Stage 6 of `docs/rebuild-plan.md`.

---

## 1. Goal

Produce two container images and a `docker-compose.yml` that make the slack-archive system deployable on UnRAID with one config file and a handful of bind mounts.

**Exit criteria** (unchanged from rebuild plan):

- `docker compose up -d web` serves the SPA + API on a mapped port.
- `docker compose run --rm archiver` runs a fresh archive pass.
- `docker compose run --rm archiver --snapshot` runs archive + creates a dated snapshot and rotates old ones.

## 2. Architecture summary

Two independent containers, communicating exclusively through a shared `data/` bind mount:

```
┌───────── host (UnRAID or local) ─────────┐
│                                          │
│  /mnt/user/appdata/slack-archive/        │
│    ├── data/         (archiver writes,   │
│    │                  web reads :ro)     │
│    ├── backups/      (archiver only)     │
│    └── config/       (archiver reads :ro)│
│           └── .token                     │
│                                          │
│  ┌─── web container ──────────────────┐  │
│  │ long-running (restart: unless-     │  │
│  │                   stopped)         │  │
│  │ express :3100                      │  │
│  │   /api/*    → backend              │  │
│  │   /static/* → data/ files          │  │
│  │   /*        → frontend dist SPA    │  │
│  │                  (fallback)        │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌─── archiver container ─────────────┐  │
│  │ one-shot (restart: no,             │  │
│  │           profiles: archive)       │  │
│  │ ENTRYPOINT node archive/dist/cli.js│  │
│  │ invoked by UnRAID User Scripts:    │  │
│  │   daily:  run --rm archiver        │  │
│  │   weekly: run --rm archiver        │  │
│  │            --snapshot              │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**Key property:** the two containers share no process supervision, no network, and no code at runtime. They are coupled only by the directory layout of the bind mounts. This means web can be upgraded without touching archiver and vice versa, and either can be pulled, rebuilt, or restarted in isolation.

## 3. File layout

New files:

```
docker/
├── archiver.Dockerfile    # builds @slack-archive/archiver into a slim runtime
├── web.Dockerfile         # builds backend + frontend into one runtime image
└── .dockerignore          # shared — referenced from both Dockerfiles
docker-compose.yml         # at repo root
.env.example               # template for local dev; copied to .env (gitignored)
```

Modified files:

```
package.json                       # + engines.node, + packageManager
backend/src/server.ts              # + static fallback for SPA
backend/src/config.ts              # + FRONTEND_DIST_DIR
archive/src/config.ts              # TOKEN_FILE → config/.token
frontend/src/api/slack.ts          # hardcoded BASE_URL → relative URLs
frontend/vite.config.ts            # + dev proxy for /api and /static
README.md                          # + Docker / UnRAID section
Dockerfile                         # DELETE (0-byte legacy placeholder)
```

Nothing else. This is a deliberately narrow blast radius — no renames of `backend/`→`server/` or `frontend/`→`web/`, no restructuring of existing source layout.

## 4. Base image, Node, and pnpm pinning

- **Base image:** `node:22-slim` for both Dockerfiles (both builder and runtime stages).
  - Rationale: Node 22 is current LTS through April 2027. Slim is Debian bookworm/glibc; avoids musl surprises with transitive native deps. Size overhead vs alpine (~30MB) is irrelevant on a NAS.
- **Node version pinned** in root `package.json`:
  ```json
  "engines": { "node": ">=22 <23" }
  ```
- **pnpm version pinned** in root `package.json` via corepack's single source of truth:
  ```json
  "packageManager": "pnpm@10.18.3"
  ```
  - Matches the version that produced the current `pnpm-lock.yaml` (v9.0 format).
  - Dockerfiles enable corepack and let it auto-activate from this field.
- **Side effect:** after the change, host-side `pnpm install` will silently use 10.18.3 regardless of globally-installed pnpm version. Expected.

## 5. Dockerfile: archiver

```dockerfile
# docker/archiver.Dockerfile
# syntax=docker/dockerfile:1

# --- builder stage ---
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /build

# Copy workspace manifests first for cache-friendly install layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/types/package.json packages/types/
COPY archive/package.json archive/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# Note: we copy all package.jsons so pnpm can resolve the full workspace,
# even though we only build the archiver. pnpm won't install frontend
# browser-only deps into the archiver's runtime image.

RUN pnpm install --frozen-lockfile

# Now copy source — cached install layer above stays warm during iteration.
COPY packages/types packages/types
COPY archive archive

RUN pnpm --filter @slack-archive/types build \
 && pnpm --filter @slack-archive/archiver build

# --- runtime stage ---
FROM node:22-slim
RUN corepack enable
WORKDIR /app

# Copy only what's needed at runtime: built output + workspace manifests
# + a pruned node_modules via a second install (prod only).
COPY --from=builder /build/pnpm-workspace.yaml /build/pnpm-lock.yaml /build/package.json ./
COPY --from=builder /build/packages/types/package.json packages/types/package.json
COPY --from=builder /build/packages/types/dist packages/types/dist
COPY --from=builder /build/archive/package.json archive/package.json
COPY --from=builder /build/archive/dist archive/dist

RUN pnpm install --frozen-lockfile --prod --filter @slack-archive/archiver...

# archive's config.ts uses process.cwd() as BASE_DIR, resolving OUT_DIR
# to <cwd>/slack-archive. Running with cwd=/app gives /app/slack-archive
# which is exactly where the bind mounts land.
WORKDIR /app

ENTRYPOINT ["node", "archive/dist/cli.js"]
CMD []
```

**Why a second `pnpm install --prod` in the runtime stage?**
- The builder stage installs dev deps for TypeScript compilation. If we copied `node_modules` directly, the runtime image carries `typescript`, `vitest`, `@types/*`, etc. — dead weight.
- Re-installing with `--prod --filter @slack-archive/archiver...` in the runtime stage gives us only runtime deps for the archiver and its transitive workspace deps (`@slack-archive/types`). This is the simpler equivalent of `pnpm deploy`.
- The extra cost is one more `pnpm install` during build (cached by the COPY layer above it). Negligible.

## 6. Dockerfile: web

```dockerfile
# docker/web.Dockerfile
# syntax=docker/dockerfile:1

# --- builder stage ---
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /build

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/types/package.json packages/types/
COPY archive/package.json archive/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN pnpm install --frozen-lockfile

COPY packages/types packages/types
COPY backend backend
COPY frontend frontend

RUN pnpm --filter @slack-archive/types build \
 && pnpm --filter slack-archive-backend build \
 && pnpm --filter frontend build

# --- runtime stage ---
FROM node:22-slim
RUN corepack enable
WORKDIR /app

COPY --from=builder /build/pnpm-workspace.yaml /build/pnpm-lock.yaml /build/package.json ./
COPY --from=builder /build/packages/types/package.json packages/types/package.json
COPY --from=builder /build/packages/types/dist packages/types/dist
COPY --from=builder /build/backend/package.json backend/package.json
COPY --from=builder /build/backend/dist backend/dist
COPY --from=builder /build/frontend/dist frontend/dist

RUN pnpm install --frozen-lockfile --prod --filter slack-archive-backend...

EXPOSE 3100
ENV NODE_ENV=production
CMD ["node", "backend/dist/server.js"]
```

**Notes:**
- Frontend's static build output is copied to `/app/frontend/dist` and served by the backend at startup. No nginx, no second process.
- Backend needs to know where the frontend dist lives — handled via `FRONTEND_DIST_DIR` in `backend/src/config.ts`, default computed relative to the built server file (details in §8).
- No ENTRYPOINT here — web is not a CLI, it's a server. `CMD` is correct.

## 7. `.dockerignore`

```
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
**/lib

# Legacy monolith (still in tree until Stage 8)
src/
bin/
static/
yarn.lock
exec_archive.sh
backup.sh
cleanup.sh
archive-nginx.conf
Dockerfile

# Existing data / backups / config from host
slack-archive/
slack-archive-new/
slack-archive-backup/
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
README.md
*.md
```

Legacy files are excluded because they're huge, irrelevant to the new stack, and scheduled for deletion in Stage 8.

## 8. Backend changes: SPA fallback

### 8.1 `backend/src/config.ts`

Add one constant:

```ts
export const FRONTEND_DIST_DIR = process.env.FRONTEND_DIST_DIR
  ? path.resolve(process.env.FRONTEND_DIST_DIR)
  : path.join(__dirname, '../../frontend/dist');
```

Same pattern as the existing `DATA_DIR` resolution. Inside the container, `__dirname` is `/app/backend/dist`, so the default resolves to `/app/frontend/dist`. In dev (`pnpm --filter backend dev`), it resolves to the local `frontend/dist` — which typically doesn't exist, and that's fine because the server checks before mounting.

### 8.2 `backend/src/server.ts`

After the last `/api/*` route, add:

```ts
import fs from 'fs-extra';
import path from 'path';
import { DATA_DIR, FRONTEND_DIST_DIR } from './config.js';

// ... existing /api routes unchanged ...

// SPA fallback — must come AFTER all /api routes.
if (fs.existsSync(FRONTEND_DIST_DIR)) {
  app.use(express.static(FRONTEND_DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST_DIR, 'index.html'));
  });
  console.log(`Serving frontend SPA from ${FRONTEND_DIST_DIR}`);
} else {
  console.log(`FRONTEND_DIST_DIR not found at ${FRONTEND_DIST_DIR} — skipping SPA mount (dev mode)`);
}
```

**Route order matters.** The `app.get('*', ...)` catch-all must be registered **after** every `/api/*` route, or it will swallow API requests. Same for `/static/*` — keep the existing `app.use('/static', ...)` before the SPA fallback.

**CORS stays enabled.** Same-origin in production is harmless; cross-origin is critical for the Vite dev server scenario (see §9.2).

## 9. Frontend changes: relative URLs + Vite proxy

### 9.1 `frontend/src/api/slack.ts`

Remove the hardcoded `BASE_URL`:

```ts
import axios from 'axios';
import type { ArchiveMessage, Channel, Users, Emojis, SearchIndex } from '@slack-archive/types';

const api = axios.create({ baseURL: '/api' });

export const getChannels = async (): Promise<Channel[]> => {
  const { data } = await api.get('/channels');
  return data;
};

export const getMessages = async (channelId: string): Promise<ArchiveMessage[]> => {
  const { data } = await api.get(`/messages/${channelId}`);
  return data;
};

export const getUsers = async (): Promise<Users> => {
  const { data } = await api.get('/users');
  return data;
};

export const getEmoji = async (): Promise<Emojis> => {
  const { data } = await api.get('/emoji');
  return data;
};

export const getFileUrl = (channelId: string, fileId: string, fileType: string): string => {
  return `/static/files/${channelId}/${fileId}.${fileType}`;
};

export const getEmojiUrl = (name: string): string => {
  return `/api/emoji/${name}`;
};

export const getSearchIndex = async (): Promise<SearchIndex> => {
  const { data } = await api.get('/search');
  return data;
};
```

### 9.2 `frontend/vite.config.ts`

Add a dev proxy so relative URLs work against a locally-running backend:

```ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api':    'http://localhost:3100',
      '/static': 'http://localhost:3100',
    },
  },
});
```

**Result:** in dev, browser hits Vite on 5173, Vite proxies `/api` and `/static` to backend on 3100. In production, browser hits backend directly and everything is same-origin. Neither environment needs environment variables to know where the API is.

## 10. Archive config change: TOKEN_FILE location

In `archive/src/config.ts`, move the token file from `OUT_DIR/.token` to `OUT_DIR/config/.token`:

```ts
export const CONFIG_DIR = path.join(OUT_DIR, "config");
export const TOKEN_FILE = path.join(CONFIG_DIR, ".token");
```

This lets `config/` function as a real sibling of `data/` and `backups/`, matching the §6 layout diagram in `rebuild-plan.md`. It also means the `config/` bind mount in docker-compose has something real to point at.

**Compatibility note:** anyone with a `.token` file at the old location (`slack-archive/.token`) will need to move it to `slack-archive/config/.token` after this change. The README's Docker section will note this; the legacy flow on `main` is unaffected.

## 11. `docker-compose.yml`

```yaml
services:
  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
    image: ghcr.io/danrlavoie/slack-archive-web:local
    restart: unless-stopped
    ports:
      - "${WEB_PORT:-3100}:3100"
    volumes:
      - ${DATA_DIR:-./data}:/app/slack-archive/data:ro
    environment:
      NODE_ENV: production

  archiver:
    build:
      context: .
      dockerfile: docker/archiver.Dockerfile
    image: ghcr.io/danrlavoie/slack-archive-archiver:local
    restart: "no"
    profiles: ["archive"]
    volumes:
      - ${DATA_DIR:-./data}:/app/slack-archive/data
      - ${BACKUPS_DIR:-./backups}:/app/slack-archive/backups
      - ${CONFIG_DIR:-./config}:/app/slack-archive/config:ro
    environment:
      SLACK_TOKEN: ${SLACK_TOKEN:-}
```

**Design notes:**

- **Image tags use `:local`** for local `docker compose build`. Stage 7 will retag and push these to `ghcr.io/danrlavoie/slack-archive-{web,archiver}:latest`.
- **`restart: "no"` on archiver** is explicit rather than the default, for clarity — this is a one-shot.
- **`profiles: ["archive"]`** means `docker compose up -d` does NOT start archiver. To run it: `docker compose run --rm archiver` (or `... --profile archive up archiver`, but `run` is the correct idiom for one-shots).
- **Host path overrides** come from `.env` or the shell. UnRAID's Docker template passes these via `-e DATA_DIR=/mnt/user/appdata/slack-archive/data` when constructing the `docker compose run` invocation.
- **`${SLACK_TOKEN:-}`** — empty fallback so compose doesn't error when `SLACK_TOKEN` is unset (e.g., when you're only running `web` and don't need it). Archive will fall back to the `.token` file if the env var is empty.

## 12. `.env.example`

```bash
# Copy this file to `.env` for local docker-compose usage.
# UnRAID users set these directly in the Docker template, not via .env.

# Required for the archiver container. Leave unset if you keep .token in config/.
SLACK_TOKEN=

# Host paths for bind mounts. Default to ./data, ./backups, ./config relative to repo.
DATA_DIR=./data
BACKUPS_DIR=./backups
CONFIG_DIR=./config

# Host port the web container is published on.
WEB_PORT=3100
```

## 13. README updates

Add a new top-level section: `## Docker deployment`. Contents:

1. Quickstart (local):
   ```bash
   cp .env.example .env
   # edit .env to set SLACK_TOKEN
   mkdir -p data backups config
   docker compose build
   docker compose up -d web           # start the web UI
   docker compose run --rm archiver   # run an archive pass
   ```
2. **UnRAID directory layout:** full tree of `/mnt/user/appdata/slack-archive/{data,backups,config}` and what each subdir contains.
3. **UnRAID Docker template hints:** which env vars map to which bind paths, which port to publish.
4. **Scheduled runs:** UnRAID User Scripts recipes (copy-paste):
   ```bash
   # daily archive (01:00)
   docker compose -f /mnt/user/appdata/slack-archive/docker-compose.yml \
       run --rm archiver

   # weekly snapshot (Sunday 02:00)
   docker compose -f /mnt/user/appdata/slack-archive/docker-compose.yml \
       run --rm archiver --snapshot
   ```
5. **Debugging a stopped archiver** (per Q6 discussion):
   - View logs from the most recent run:
     ```bash
     docker compose logs archiver        # if run without --rm
     # or capture stdout directly:
     docker compose run --rm archiver 2>&1 | tee /tmp/archive-$(date +%F).log
     ```
   - Shell into the image (bypass ENTRYPOINT):
     ```bash
     docker compose run --rm --entrypoint bash archiver
     ```
     Lands in `/app`. Inspect `slack-archive/data/.last-successful-run`, the `dist/` tree, or run `node archive/dist/cli.js --help` manually.
   - Rerun with verbose logging: set `DEBUG_OUTPUT=1` or similar env var on the `docker compose run` command (whatever the archiver actually honors).
   - `--rm` flag is used so archiver containers don't accumulate. Drop `--rm` during active debugging to inspect the stopped container's filesystem with `docker compose ps -a` + `docker inspect`.

## 14. Testing strategy

**No unit tests in Stage 6.** Dockerfile correctness is a build+integration concern, not a unit-test concern.

Verification is manual and happens in this order:

1. **Host-side build stays green:** `pnpm install && pnpm -r build` from repo root. Catches regressions in the frontend URL refactor and the backend config changes before we touch Docker.
2. **Host-side dev still works:** `pnpm --filter backend dev` + `pnpm --filter frontend dev`, load the app in a browser, verify channels load and a message anchor URL still resolves. Catches route-ordering bugs in the server changes and proxy misconfig in Vite.
3. **Archiver image builds:** `docker build -f docker/archiver.Dockerfile -t archiver-test .`
4. **Web image builds:** `docker build -f docker/web.Dockerfile -t web-test .`
5. **Compose sanity:** `docker compose config` validates the compose file syntactically.
6. **Web container runs:** `docker compose up -d web` → `curl http://localhost:3100/api/channels` returns valid JSON (or an empty array if data dir is empty), `curl http://localhost:3100/` returns the SPA `index.html`.
7. **Archiver container runs:** `docker compose run --rm archiver --help` exits 0 with help output. Then (against a real test Slack workspace with a dummy token, OR by pointing at an existing `data/` dir): `docker compose run --rm archiver` completes without error.
8. **Snapshot flag works:** `docker compose run --rm archiver --snapshot` creates `backups/YYYY-MM-DD/` populated with the current data dir contents.

Any failure at step 1 or 2 means the non-Docker code changes are wrong — fix before building images.

## 15. What Stage 6 does NOT do

Deliberate non-goals, to keep scope tight:

- **No registry push.** Images are built locally. Stage 7 handles pushing to `ghcr.io/danrlavoie/slack-archive-*`.
- **No renames.** `backend/` and `frontend/` stay as directory names. `slack-archive-backend` stays as the backend's package name. Any renames happen in Stage 8 with the legacy removal.
- **No UnRAID template XML.** Stage 7 ships the `unraid/` directory with template files. Stage 6 produces the compose file those templates will invoke.
- **No production secrets management.** `.env` + bind-mounted `.token` is the whole strategy. No Docker secrets, no Vault, no sealed-secrets.
- **No health checks.** Web is simple enough that `restart: unless-stopped` is sufficient; archiver is a one-shot where health doesn't apply.
- **No multi-arch builds.** UnRAID is x86_64; we build for `linux/amd64` only. Stage 7 can revisit if needed.
- **No nginx, no reverse proxy inside the stack.** The user's existing reverse proxy (if any) terminates in front of the web container on the mapped port.

## 16. Risks and unknowns

1. **pnpm deploy-less approach may still pull unwanted deps into runtime.** The `pnpm install --prod --filter <pkg>...` in the runtime stage should restrict to runtime deps, but I want to verify the actual `node_modules` footprint after the first build. If it turns out to carry unexpected packages, we can pivot to `pnpm deploy` in a follow-up.

2. **`__dirname` resolution in ESM.** `backend/src/config.ts` already uses the `fileURLToPath(import.meta.url)` pattern and it works. But the built output under `/app/backend/dist/config.js` needs to resolve relative to the built file, not the source file. Need to verify the computed `FRONTEND_DIST_DIR` default is correct in the built image.

3. **Vite proxy for `/static` only catches exact path prefix.** If the frontend ever requests a file path that doesn't start with `/static`, it'll try to load from Vite's own server. Current codebase uses `/static/files/...` and `/api/emoji/...` only, so this is fine, but it's a contract to remember.

4. **Frontend route catch-all `app.get('*', ...)` and 404s.** Any non-matching route returns `index.html` instead of a 404. For API clients, this is confusing — hitting `/api/nonexistent` returns the SPA instead of a JSON 404. Acceptable because (a) this is a private LAN app and (b) the frontend doesn't care, but worth documenting.

5. **ENTRYPOINT ergonomics.** Debugging a broken archiver requires `--entrypoint bash`. Documented in README, but the first time it happens in production, we'll rediscover it. Acceptable.

6. **Host UID/GID mismatch on bind mounts.** Containers run as root by default in `node:22-slim`. Files written into the bind mount are owned by root on the host. On UnRAID this is usually fine (host user is also effectively root-equivalent via `nobody:users`), but it's worth calling out in the README. Deferred fix: add `user: "1000:1000"` or similar to compose if it becomes a problem.

## 17. Sequencing (preview for the plan)

Rough task order. The writing-plans skill will break these into TDD-granular steps.

1. Root `package.json` additions (`engines`, `packageManager`).
2. Frontend URL refactor + Vite proxy. Verify dev still works.
3. Backend SPA fallback + `FRONTEND_DIST_DIR`. Verify dev still works.
4. Archive `TOKEN_FILE` move to `config/`. Migrate local `.token` if present.
5. `.dockerignore`.
6. `docker/archiver.Dockerfile` + first successful build.
7. `docker/web.Dockerfile` + first successful build.
8. `docker-compose.yml` + `.env.example`.
9. Smoke tests (§14 steps 6–8) against real data.
10. README Docker section.
11. Delete legacy placeholder `Dockerfile` at repo root.
12. Commit + stage complete.

---

## Self-review checklist (internal)

- [x] No placeholders, TBDs, or "add appropriate X"
- [x] Every proposed file change is specific (file path + what changes)
- [x] Scope boundary is explicit (§15 non-goals)
- [x] Risks are named, not hidden (§16)
- [x] Testing strategy is concrete (§14)
- [x] Matches rebuild-plan Stage 6 exit criteria (§1)
