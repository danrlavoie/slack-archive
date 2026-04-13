# Stage 6: Dockerize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two buildable container images (`archiver`, `web`) and a `docker-compose.yml` so the slack-archive stack runs unattended on UnRAID via bind-mounted `data/`, `backups/`, and `config/` directories.

**Architecture:** Two independent containers sharing state only through filesystem bind mounts. `web` is long-running and serves `/api/*` + the built frontend SPA as a fallback. `archiver` is a one-shot CLI invoked explicitly by UnRAID User Scripts, with `--snapshot` as a passthrough flag for weekly runs. Build context is the repo root for both Dockerfiles so they can access the pnpm workspace manifests and `packages/types/`.

**Tech Stack:** Node 22 LTS slim, pnpm 10.18.3 (pinned via `packageManager`), Docker multi-stage builds, docker-compose with profiles, existing Express backend and Vite+React frontend.

**Spec:** `docs/superpowers/specs/2026-04-13-stage6-dockerize-design.md`

**Branch:** `refactor/rebuild-plan` (commits accumulate here; fast-forward to `main` when v1 is complete).

---

## File Structure

New files:

| Path | Responsibility |
|------|---------------|
| `docker/archiver.Dockerfile` | Multi-stage build producing a slim runtime image for the archiver CLI. Builder compiles `@slack-archive/types` and `@slack-archive/archiver`; runtime stage has prod-only deps and `ENTRYPOINT ["node", "archive/dist/cli.js"]`. |
| `docker/web.Dockerfile` | Multi-stage build producing a runtime image that serves both the Express backend and the built frontend SPA. Builder compiles types, backend, and frontend; runtime stage runs `node backend/dist/server.js`. |
| `docker/.dockerignore` | Excludes legacy monolith, `node_modules`, `dist/`, existing `data/` / `backups/`, `.env`, docs. Shared by both Dockerfiles (referenced via `.dockerignore` at repo root — see Task 9 note). |
| `docker-compose.yml` | Root compose file defining `web` (restart: unless-stopped) and `archiver` (one-shot, profiles: archive). Bind mounts parameterized via env vars. |
| `.env.example` | Template for local dev compose usage. Committed. |
| `.dockerignore` (repo root) | Actual dockerignore file Docker reads during build (Docker only honors one at repo root). |
| `archive/src/utils/__tests__/config.test.ts` | Vitest test locking in `TOKEN_FILE` living under `config/`. |
| `docs/superpowers/plans/2026-04-13-stage6-dockerize.md` | This plan. |

Modified files:

| Path | Change |
|------|--------|
| `package.json` (repo root) | Add `"engines": { "node": ">=22 <23" }` and `"packageManager": "pnpm@10.18.3"`. |
| `archive/src/config.ts` | Add `CONFIG_DIR = path.join(OUT_DIR, "config")`. Change `TOKEN_FILE` from `path.join(OUT_DIR, ".token")` to `path.join(CONFIG_DIR, ".token")`. Export `CONFIG_DIR`. |
| `backend/src/config.ts` | Add `FRONTEND_DIST_DIR` resolving to `../../frontend/dist` relative to the built server file, overridable via `FRONTEND_DIST_DIR` env var. |
| `backend/src/server.ts` | Import `FRONTEND_DIST_DIR` and `fs`. After all `/api/*` routes, add a conditional SPA fallback: `app.use(express.static(FRONTEND_DIST_DIR))` + `app.get('*', ...)` serving `index.html`, gated on `fs.existsSync(FRONTEND_DIST_DIR)`. |
| `frontend/src/api/slack.ts` | Remove hardcoded `BASE_URL = 'http://localhost:3100'`. Change `axios.create({ baseURL: '/api' })`. Update `getFileUrl` and `getEmojiUrl` to use relative paths. |
| `frontend/vite.config.ts` | Add `server.proxy` for `/api` and `/static` pointing at `http://localhost:3100`. Keep existing `server.port: 3000` and `@` alias. |
| `README.md` | Add `## Docker deployment` section with quickstart, UnRAID layout, User Scripts recipes, debugging instructions. |
| `Dockerfile` (repo root, 0 bytes) | Delete. Legacy placeholder. |

Not touched:

- `backend/src/utils/data-load.ts`, `backend/src/utils/search.ts`, or any `/api/*` handler logic.
- Any `frontend/src/components/*` files — URL base refactor is contained to `src/api/slack.ts`.
- `archive/src/cli.ts` or `archive/src/utils/snapshot.ts` — archiver logic unchanged from Stage 5.
- Any `packages/types/` source.

---

## Task sequence

1. **Root `package.json` version pinning** — prerequisite for reproducible builds.
2. **Archive `TOKEN_FILE` → `config/`** — smallest code change, has a real unit test, unblocks the `config/` bind mount.
3. **Frontend URL refactor + Vite proxy** — contained to two files, no backend changes yet.
4. **Backend `FRONTEND_DIST_DIR` config constant** — pure addition, no behavior yet.
5. **Backend SPA fallback route** — uses the constant from Task 4. Verify dev mode still works.
6. **Dev-stack smoke test** — manual verification that Tasks 2–5 didn't break local development.
7. **Repo-root `.dockerignore`** — required before any Docker build.
8. **`docker/archiver.Dockerfile`** — build and smoke-test archiver image.
9. **`docker/web.Dockerfile`** — build and smoke-test web image.
10. **`docker-compose.yml` + `.env.example`** — compose file and dev template.
11. **Web container smoke test** — `docker compose up -d web`, curl API, curl SPA.
12. **Archiver container smoke test** — `docker compose run --rm archiver --help` and a real run against a test workspace.
13. **Snapshot flag smoke test** — `docker compose run --rm archiver --snapshot` produces dated backup.
14. **README Docker section** — quickstart, layout, User Scripts, debugging.
15. **Delete legacy placeholder `Dockerfile`** — final cleanup.
16. **Stage 6 wrap commit** — mark stage complete in rebuild plan.

---

## Task 1: Pin Node and pnpm versions in root `package.json`

**Files:**
- Modify: `package.json` (repo root)

**Rationale:** Before we build any container image, the repo needs to declare which Node and pnpm versions it targets. Corepack in the Dockerfiles reads `packageManager` to auto-activate the right pnpm. `engines` communicates the Node floor to developers and to any `pnpm install` that honors it.

- [ ] **Step 1: Read current root `package.json`**

Run: `cat package.json`

Expected output:
```json
{
  "private": true,
  "scripts": {
    "build": "pnpm -r build"
  }
}
```

- [ ] **Step 2: Add `engines` and `packageManager` fields**

Overwrite `package.json` with:
```json
{
  "private": true,
  "engines": {
    "node": ">=22 <23"
  },
  "packageManager": "pnpm@10.18.3",
  "scripts": {
    "build": "pnpm -r build"
  }
}
```

- [ ] **Step 3: Verify corepack activates the pinned pnpm**

Run: `corepack enable && pnpm --version`

Expected output: `10.18.3` (corepack reads `packageManager` and activates that exact version; may take a few seconds the first time it downloads).

If it prints a different version, corepack is not enabled or the field is malformed — re-read `package.json` and confirm the `packageManager` line is valid JSON.

- [ ] **Step 4: Verify workspace install still works under pinned pnpm**

Run: `pnpm install --frozen-lockfile`

Expected: install completes without "lockfile out of date" errors. No new changes to `pnpm-lock.yaml`.

If it modifies the lockfile, that means the pinned pnpm version disagrees with whatever produced the current lockfile — stop and investigate before committing.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: pin node 22 and pnpm 10.18.3 for reproducible docker builds

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Move `TOKEN_FILE` under `config/` in archive config

**Files:**
- Modify: `archive/src/config.ts:42`
- Create: `archive/src/utils/__tests__/config.test.ts`

**Rationale:** The docker-compose design mounts `config/` as a sibling of `data/` and `backups/`. For that mount point to mean anything, the archiver needs to actually look for `.token` under `config/`. This is the only code change required for the `config/` bind mount to be live.

- [ ] **Step 1: Write the failing test**

Create `archive/src/utils/__tests__/config.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import path from "node:path";
import { CONFIG_DIR, OUT_DIR, TOKEN_FILE } from "../../config.js";

describe("archive config paths", () => {
  test("CONFIG_DIR is a sibling of data/ under OUT_DIR", () => {
    expect(CONFIG_DIR).toBe(path.join(OUT_DIR, "config"));
  });

  test("TOKEN_FILE lives under CONFIG_DIR", () => {
    expect(TOKEN_FILE).toBe(path.join(CONFIG_DIR, ".token"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd archive && pnpm test -- src/utils/__tests__/config.test.ts`

Expected: test file fails to import `CONFIG_DIR` (`SyntaxError` or `undefined` — the export doesn't exist yet).

- [ ] **Step 3: Add `CONFIG_DIR` and update `TOKEN_FILE` in `archive/src/config.ts`**

Current relevant section (around line 41–48):
```ts
export const OUT_DIR = path.join(BASE_DIR, process.env.ARCHIVE_OUT_DIR || "slack-archive");
export const TOKEN_FILE = path.join(OUT_DIR, ".token");
export const DATE_FILE = path.join(OUT_DIR, ".last-successful-run");
export const DATA_DIR = path.join(OUT_DIR, "data");
export const FILES_DIR = path.join(DATA_DIR, "files");
export const AVATARS_DIR = path.join(DATA_DIR, "avatars");
export const EMOJIS_DIR = path.join(DATA_DIR, "emojis");
export const BACKUPS_DIR = path.join(OUT_DIR, "backups");
```

Change to:
```ts
export const OUT_DIR = path.join(BASE_DIR, process.env.ARCHIVE_OUT_DIR || "slack-archive");
export const CONFIG_DIR = path.join(OUT_DIR, "config");
export const TOKEN_FILE = path.join(CONFIG_DIR, ".token");
export const DATE_FILE = path.join(OUT_DIR, ".last-successful-run");
export const DATA_DIR = path.join(OUT_DIR, "data");
export const FILES_DIR = path.join(DATA_DIR, "files");
export const AVATARS_DIR = path.join(DATA_DIR, "avatars");
export const EMOJIS_DIR = path.join(DATA_DIR, "emojis");
export const BACKUPS_DIR = path.join(OUT_DIR, "backups");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd archive && pnpm test -- src/utils/__tests__/config.test.ts`

Expected: both `config paths` tests pass. Full vitest summary shows 2 new passing tests added to the existing suite.

- [ ] **Step 5: Run full archive test suite to catch regressions**

Run: `cd archive && pnpm test`

Expected: all tests pass (snapshot tests from Stage 5 + new config tests). No failures.

- [ ] **Step 6: Check that no existing code hardcodes the old `.token` path**

Run: `grep -rn "\.token" archive/src/ --include="*.ts"`

Expected: only references are via the `TOKEN_FILE` constant (likely in `archive/src/utils/prompt.ts` or similar). If any file has a literal `".token"` string joined against `OUT_DIR` manually, update it to use `TOKEN_FILE` instead. Note the findings but do not modify unrelated code.

- [ ] **Step 7: Migrate local `.token` file if it exists**

Run:
```bash
if [ -f archive/slack-archive/.token ] && [ ! -f archive/slack-archive/config/.token ]; then
  mkdir -p archive/slack-archive/config
  mv archive/slack-archive/.token archive/slack-archive/config/.token
  echo "Migrated .token to config/"
else
  echo "No migration needed"
fi
```

Expected: prints either "Migrated .token to config/" or "No migration needed". No errors.

- [ ] **Step 8: Commit**

```bash
git add archive/src/config.ts archive/src/utils/__tests__/config.test.ts
git commit -m "feat(archive): move TOKEN_FILE under config/ subdirectory

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Refactor frontend API client to use relative URLs

**Files:**
- Modify: `frontend/src/api/slack.ts:1-42`

**Rationale:** The hardcoded `BASE_URL = 'http://localhost:3100'` breaks inside a container where the frontend is served same-origin with the backend. Switching to relative URLs makes the frontend environment-agnostic.

- [ ] **Step 1: Rewrite `frontend/src/api/slack.ts` with relative URLs**

Full replacement content:
```ts
import axios from 'axios';
import type { ArchiveMessage, Channel, Users, Emojis, SearchIndex } from '@slack-archive/types';

const api = axios.create({
  baseURL: '/api'
});

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

- [ ] **Step 2: Verify frontend typecheck still passes**

Run: `cd frontend && pnpm exec tsc -b`

Expected: no errors. If there are errors about missing imports or type mismatches, the API contract has drifted — check `@slack-archive/types` exports match the imports used above.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/slack.ts
git commit -m "refactor(frontend): use relative URLs in API client

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Add Vite dev proxy for `/api` and `/static`

**Files:**
- Modify: `frontend/vite.config.ts:5-15`

**Rationale:** Now that the API client uses relative URLs, the Vite dev server needs to proxy `/api` and `/static` requests to the backend running on 3100. Without this, the browser would try to fetch `/api/channels` from Vite's own 3000 port and 404.

- [ ] **Step 1: Read current `frontend/vite.config.ts`**

Current content:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
});
```

- [ ] **Step 2: Add proxy configuration to `server` block**

Replace the file with:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3100',
      '/static': 'http://localhost:3100',
    },
  },
});
```

- [ ] **Step 3: Verify Vite config parses**

Run: `cd frontend && pnpm exec vite --help`

Expected: Vite prints its help output without errors. (This loads the config file; syntax errors would fail here.)

- [ ] **Step 4: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "feat(frontend): proxy /api and /static to backend in dev

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Add `FRONTEND_DIST_DIR` constant to backend config

**Files:**
- Modify: `backend/src/config.ts:1-22`

**Rationale:** The web container needs the backend to know where the built frontend assets live. Following the existing `DATA_DIR` pattern: default resolved relative to the built server file, overridable via env var.

- [ ] **Step 1: Read current `backend/src/config.ts`**

Current content:
```ts
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = process.env.ARCHIVE_DATA_DIR
  ? path.resolve(process.env.ARCHIVE_DATA_DIR)
  : path.join(__dirname, '../../slack-archive/data');

export const FILES_DIR = path.join(DATA_DIR, 'files');
export const EMOJIS_DIR = path.join(DATA_DIR, 'emojis');
export const AVATARS_DIR = path.join(DATA_DIR, 'avatars');

export const CHANNELS_DATA_PATH = path.join(DATA_DIR, 'channels.json');
export const USERS_DATA_PATH = path.join(DATA_DIR, 'users.json');
export const EMOJIS_DATA_PATH = path.join(DATA_DIR, 'emojis.json');
export const SEARCH_DATA_PATH = path.join(DATA_DIR, 'search-index.json');

export const getChannelDataFilePath = (channelId: string): string => {
  return path.join(DATA_DIR, `${channelId}.json`);
};
```

- [ ] **Step 2: Add `FRONTEND_DIST_DIR` export**

Append the following after the `DATA_DIR` declaration (keep everything else unchanged):

```ts
export const FRONTEND_DIST_DIR = process.env.FRONTEND_DIST_DIR
  ? path.resolve(process.env.FRONTEND_DIST_DIR)
  : path.join(__dirname, '../../frontend/dist');
```

Final file content:
```ts
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = process.env.ARCHIVE_DATA_DIR
  ? path.resolve(process.env.ARCHIVE_DATA_DIR)
  : path.join(__dirname, '../../slack-archive/data');

export const FRONTEND_DIST_DIR = process.env.FRONTEND_DIST_DIR
  ? path.resolve(process.env.FRONTEND_DIST_DIR)
  : path.join(__dirname, '../../frontend/dist');

export const FILES_DIR = path.join(DATA_DIR, 'files');
export const EMOJIS_DIR = path.join(DATA_DIR, 'emojis');
export const AVATARS_DIR = path.join(DATA_DIR, 'avatars');

export const CHANNELS_DATA_PATH = path.join(DATA_DIR, 'channels.json');
export const USERS_DATA_PATH = path.join(DATA_DIR, 'users.json');
export const EMOJIS_DATA_PATH = path.join(DATA_DIR, 'emojis.json');
export const SEARCH_DATA_PATH = path.join(DATA_DIR, 'search-index.json');

export const getChannelDataFilePath = (channelId: string): string => {
  return path.join(DATA_DIR, `${channelId}.json`);
};
```

- [ ] **Step 3: Verify backend typecheck passes**

Run: `cd backend && pnpm exec tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/config.ts
git commit -m "feat(backend): add FRONTEND_DIST_DIR config constant

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Add SPA static fallback to backend server

**Files:**
- Modify: `backend/src/server.ts:1-81`

**Rationale:** In production (inside the web container), the backend needs to serve the built frontend SPA at all non-`/api` routes so React Router can handle client-side navigation. Gated on `FRONTEND_DIST_DIR` existing so dev mode is unaffected.

- [ ] **Step 1: Rewrite `backend/src/server.ts` with SPA fallback**

Full replacement content:
```ts
import express from 'express';
import cors from 'cors';
import fs from 'fs-extra';
import path from 'path';
import {
  getChannels,
  getMessages,
  getUsers,
  getEmoji,
  getSearchFile,
  getEmojiFile
} from './utils/data-load.js';
import { DATA_DIR, FRONTEND_DIST_DIR } from './config.js';

const app = express();
const port = process.env.PORT || 3100;

app.use(cors());
app.use(express.json());
app.use('/static', express.static(DATA_DIR));

// API Routes
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await getChannels();
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

app.get('/api/messages/:channelId', async (req, res) => {
  try {
    const messages = await getMessages(req.params.channelId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/emoji', async (req, res) => {
  try {
    const emoji = await getEmoji();
    res.json(emoji);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emoji' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const searchData = await getSearchFile();
    res.json(searchData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch search data' });
  }
});

app.get('/api/emoji/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const emojiPath = await getEmojiFile(name);
    if (!emojiPath) {
      return res.status(404).json({ error: 'Emoji not found' });
    }
    res.sendFile(emojiPath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emoji' });
  }
});

// SPA fallback — MUST come after all /api/* routes.
// Gated on FRONTEND_DIST_DIR existing so dev mode (where the frontend
// is served by Vite on a separate port) is unaffected.
if (fs.existsSync(FRONTEND_DIST_DIR)) {
  app.use(express.static(FRONTEND_DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST_DIR, 'index.html'));
  });
  console.log(`Serving frontend SPA from ${FRONTEND_DIST_DIR}`);
} else {
  console.log(`FRONTEND_DIST_DIR not found at ${FRONTEND_DIST_DIR} — skipping SPA mount (dev mode)`);
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
```

- [ ] **Step 2: Verify backend typecheck passes**

Run: `cd backend && pnpm exec tsc --noEmit`

Expected: no errors. If `fs-extra` or `path` imports fail, check `backend/package.json` has `fs-extra` (it already does per existing deps) and `@types/node` for `path`.

- [ ] **Step 3: Verify backend dev mode still starts cleanly**

Run: `cd backend && pnpm dev` (in background terminal or separate shell).

Expected stdout includes:
```
FRONTEND_DIST_DIR not found at <absolute path>/frontend/dist — skipping SPA mount (dev mode)
Server running at http://localhost:3100
```

If the directory does exist from a previous build, the log will say "Serving frontend SPA from ..." instead — also acceptable, just means a stale build is present.

Stop the server (Ctrl-C or kill the background process) after verifying.

- [ ] **Step 4: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat(backend): serve frontend SPA as fallback when dist exists

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Dev-stack smoke test

**Files:** none modified.

**Rationale:** Tasks 2–6 changed code in three different places (archive config, frontend URLs, backend server). Before touching Docker, verify the local dev flow still works end-to-end. Catching a regression here is much cheaper than catching it inside a container.

- [ ] **Step 1: Confirm an existing data dir is available**

Run: `ls archive/slack-archive/data/*.json 2>&1 | head -5`

Expected: at least `channels.json`, `users.json`, `emojis.json`. If the output is "No such file or directory", the dev stack has no data to render — skip to Step 6 (typecheck only) and note that runtime verification is deferred to Task 11.

- [ ] **Step 2: Point backend at the existing data dir**

Run:
```bash
ls backend/../slack-archive/data 2>&1 || \
  ARCHIVE_DATA_DIR=$(realpath archive/slack-archive/data) echo "backend needs ARCHIVE_DATA_DIR=$ARCHIVE_DATA_DIR"
```

Expected: either the default path resolves (no action needed) OR prints an `ARCHIVE_DATA_DIR=...` line to use in the next step.

- [ ] **Step 3: Start backend in background**

Run (from repo root):
```bash
cd backend && ARCHIVE_DATA_DIR=$(realpath ../archive/slack-archive/data) pnpm dev &
BACKEND_PID=$!
sleep 3
```

Expected: backend logs `Server running at http://localhost:3100`. No crash.

- [ ] **Step 4: Hit `/api/channels`**

Run: `curl -s http://localhost:3100/api/channels | head -c 200`

Expected: a JSON array starting with `[` — not an error page, not empty, not a 500.

- [ ] **Step 5: Start frontend in background and verify proxy**

Run:
```bash
cd frontend && pnpm dev &
FRONTEND_PID=$!
sleep 5
```

Expected: Vite logs something like `Local: http://localhost:3000/`.

Run: `curl -s http://localhost:3000/api/channels | head -c 200`

Expected: same JSON array as Step 4. If this returns HTML or a 404, the Vite proxy config from Task 4 is wrong — stop and fix.

- [ ] **Step 6: Stop both dev servers**

Run:
```bash
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
wait 2>/dev/null
```

Expected: both processes exit cleanly.

- [ ] **Step 7: Run full workspace typecheck**

Run: `pnpm -r build`

Expected: all packages build successfully. `archive/`, `backend/`, `frontend/`, `packages/types/` each compile.

- [ ] **Step 8: Run archive tests**

Run: `cd archive && pnpm test`

Expected: all tests pass (including the new `config.test.ts` from Task 2 and the snapshot tests from Stage 5).

No commit for this task — it's verification only.

---

## Task 8: Add repo-root `.dockerignore`

**Files:**
- Create: `.dockerignore`

**Rationale:** Docker only honors a `.dockerignore` at the build context root. Without one, every `docker build` sends the entire repo (including `node_modules`, `dist/`, existing data dirs, git history) to the Docker daemon — slow and error-prone.

- [ ] **Step 1: Create `.dockerignore` with full exclusion list**

Content:
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
archive/slack-archive/
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

- [ ] **Step 2: Verify the file exists and is non-empty**

Run: `wc -l .dockerignore`

Expected: roughly 40 lines.

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore for docker builds

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Create `docker/archiver.Dockerfile`

**Files:**
- Create: `docker/archiver.Dockerfile`

**Rationale:** The archiver image is the simpler of the two — it only needs to build `@slack-archive/types` and `@slack-archive/archiver`, then run the CLI.

- [ ] **Step 1: Create `docker/` directory**

Run: `mkdir -p docker`

Expected: no output, directory exists.

- [ ] **Step 2: Write `docker/archiver.Dockerfile`**

Full file content:
```dockerfile
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

# Copy workspace manifests + lockfile so pnpm can do a prod-only install.
COPY --from=builder /build/pnpm-workspace.yaml /build/pnpm-lock.yaml /build/package.json ./
COPY --from=builder /build/packages/types/package.json packages/types/package.json
COPY --from=builder /build/packages/types/dist packages/types/dist
COPY --from=builder /build/archive/package.json archive/package.json
COPY --from=builder /build/archive/dist archive/dist

# Backend and frontend manifests are needed so pnpm can resolve the workspace,
# but we only install archiver's prod deps via the --filter flag.
COPY --from=builder /build/backend/package.json backend/package.json
COPY --from=builder /build/frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile --prod --filter @slack-archive/archiver...

# archive's config.ts uses process.cwd() as BASE_DIR. WORKDIR /app means
# OUT_DIR resolves to /app/slack-archive, which matches the bind mounts.
WORKDIR /app

ENTRYPOINT ["node", "archive/dist/cli.js"]
CMD []
```

- [ ] **Step 3: Build the image**

Run: `docker build -f docker/archiver.Dockerfile -t slack-archive-archiver:local .`

Expected: the build completes successfully. The last lines should include `Successfully tagged slack-archive-archiver:local` (or the buildx equivalent).

If the build fails at the `pnpm install --frozen-lockfile` step with "lockfile out of date", the local lockfile was regenerated by a newer pnpm — revert to the committed lockfile and re-run.

If the build fails at the `pnpm --filter @slack-archive/archiver build` step, the archive package has a TypeScript error — run `cd archive && pnpm build` locally to reproduce.

- [ ] **Step 4: Smoke test the image (help flag)**

Run: `docker run --rm slack-archive-archiver:local --help`

Expected: the archiver CLI prints its help output and exits 0. If `--help` isn't a real flag, it may log "unknown flag" and exit 1 — that's still proof the ENTRYPOINT fires correctly.

Alternative if `--help` is not handled: `docker run --rm --entrypoint node slack-archive-archiver:local archive/dist/cli.js 2>&1 | head -5` — expect output about missing SLACK_TOKEN or unable to read data dir, which proves the binary runs.

- [ ] **Step 5: Inspect the image size**

Run: `docker images slack-archive-archiver:local --format '{{.Size}}'`

Expected: somewhere between 250MB and 500MB. If it's >1GB, the runtime stage accidentally kept dev dependencies — check the `pnpm install --prod` line in Step 2.

- [ ] **Step 6: Commit**

```bash
git add docker/archiver.Dockerfile
git commit -m "feat(docker): add multi-stage archiver dockerfile

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Create `docker/web.Dockerfile`

**Files:**
- Create: `docker/web.Dockerfile`

**Rationale:** The web image combines backend and frontend into one runtime. The backend serves `/api/*` plus the built frontend SPA as a fallback.

- [ ] **Step 1: Write `docker/web.Dockerfile`**

Full file content:
```dockerfile
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
COPY --from=builder /build/frontend/package.json frontend/package.json
COPY --from=builder /build/frontend/dist frontend/dist

# archive manifest needed so pnpm can resolve the full workspace.
COPY --from=builder /build/archive/package.json archive/package.json

RUN pnpm install --frozen-lockfile --prod --filter slack-archive-backend...

EXPOSE 3100
ENV NODE_ENV=production
CMD ["node", "backend/dist/server.js"]
```

- [ ] **Step 2: Build the image**

Run: `docker build -f docker/web.Dockerfile -t slack-archive-web:local .`

Expected: build completes. Frontend build may take 30–60 seconds for the Vite bundle.

Common failure: if `pnpm --filter frontend build` fails with `tsc -b` errors, the frontend has a typecheck issue — likely in `src/api/slack.ts` if Task 3 left a loose end. Run `cd frontend && pnpm build` locally to reproduce.

- [ ] **Step 3: Smoke test the image starts**

Run:
```bash
docker run --rm -d --name web-test -p 3100:3100 slack-archive-web:local
sleep 2
docker logs web-test
```

Expected logs:
```
FRONTEND_DIST_DIR not found at /app/frontend/dist — skipping SPA mount (dev mode)
```
**Wait — that's wrong.** If the log says "not found", the frontend dist was not copied into the runtime image. Should say:
```
Serving frontend SPA from /app/frontend/dist
Server running at http://localhost:3100
```

If the dist is not found, check the runtime `COPY --from=builder /build/frontend/dist frontend/dist` line in Step 1.

- [ ] **Step 4: Hit the SPA fallback**

Run: `curl -s http://localhost:3100/ | head -c 200`

Expected: HTML starting with `<!doctype html>` or `<!DOCTYPE html>` — the `index.html` from the Vite build.

- [ ] **Step 5: Hit an API route (will 500 because no data mounted)**

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/channels`

Expected: `500` (data dir is empty because nothing is mounted). The point of this test is to confirm the API route is reachable, not that it returns valid data.

- [ ] **Step 6: Stop the test container**

Run: `docker stop web-test`

Expected: `web-test` printed.

- [ ] **Step 7: Commit**

```bash
git add docker/web.Dockerfile
git commit -m "feat(docker): add multi-stage web dockerfile serving backend+frontend

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Create `docker-compose.yml` and `.env.example`

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Rationale:** The compose file wires the two images together with the correct bind mounts, ports, and profiles. `.env.example` documents the local dev config template.

- [ ] **Step 1: Write `docker-compose.yml`**

Full content:
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

- [ ] **Step 2: Write `.env.example`**

Full content:
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

- [ ] **Step 3: Validate compose file syntax**

Run: `docker compose config`

Expected: the compose file is printed in resolved form with env vars expanded. No syntax errors.

If it complains about the `profiles` field, the compose version is too old — requires Compose v2.1+, which is bundled with Docker 20.10+.

- [ ] **Step 4: Verify `docker compose up -d` only starts `web`**

Run:
```bash
mkdir -p data backups config
docker compose up -d
docker compose ps
```

Expected: exactly one container (`web`) running. The archiver does not appear because of `profiles: ["archive"]`.

- [ ] **Step 5: Stop the stack**

Run: `docker compose down`

Expected: `web` container stopped and removed.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(docker): add docker-compose.yml and .env.example

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 12: End-to-end smoke test (web container with real data)

**Files:** none modified.

**Rationale:** Verify the web container can serve actual archive data, not just respond to requests.

- [ ] **Step 1: Seed `./data` with a real archive**

Run: `cp -r archive/slack-archive/data/* data/ 2>/dev/null || echo "no source data to copy"`

Expected: if you have archive output from Stage 1/2 testing, it gets copied. Otherwise the compose run will still function but API calls will return empty arrays.

- [ ] **Step 2: Start the web container**

Run: `docker compose up -d web`

Expected: `web` starts. No errors in `docker compose logs web`.

- [ ] **Step 3: Verify API returns channel data**

Run: `curl -s http://localhost:3100/api/channels | head -c 200`

Expected: a JSON array — `[{"id":"C..."` etc. — if data was seeded, or `[]` if not.

- [ ] **Step 4: Verify SPA is served**

Run: `curl -s http://localhost:3100/ | grep -o '<title>[^<]*</title>'`

Expected: `<title>...</title>` tag from the Vite-built `index.html`.

- [ ] **Step 5: Verify SPA fallback catches deep links**

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/ws/demo/c/C12345`

Expected: `200`. The backend serves `index.html` for any non-`/api` path.

- [ ] **Step 6: Verify API 404 behavior (catch-all doesn't swallow API)**

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/nonexistent`

Expected: `404` (express default), NOT `200` + HTML. If this returns 200, the SPA catch-all was registered before the `/api` routes — check route ordering in `backend/src/server.ts`.

- [ ] **Step 7: Stop**

Run: `docker compose down`

Expected: web container stopped.

No commit for this task.

---

## Task 13: End-to-end smoke test (archiver container)

**Files:** none modified.

**Rationale:** Verify the archiver container runs end-to-end, both as a daily pass and with the `--snapshot` flag.

- [ ] **Step 1: Seed `./config/.token` with the Slack token**

Run:
```bash
mkdir -p config
if [ -f archive/slack-archive/config/.token ]; then
  cp archive/slack-archive/config/.token config/.token
elif [ -n "$SLACK_TOKEN" ]; then
  echo "Using SLACK_TOKEN env var instead of file"
else
  echo "WARNING: no token available — Task 13 cannot run end-to-end"
fi
```

Expected: either the token file is copied, or `SLACK_TOKEN` is set in the env, or a warning that this task's runtime verification is blocked.

If no token is available, stop here and verify only Step 2 (help smoke test) below. Full archive verification requires a real Slack workspace.

- [ ] **Step 2: Verify archiver CLI runs (help flag or equivalent)**

Run: `docker compose run --rm archiver --help 2>&1 | head -20`

Expected: either the archiver prints help text, or it prints an "unknown flag" error and exits — either way confirms the ENTRYPOINT fires. A Node module load error would be a failure.

- [ ] **Step 3: Run a full archive pass (if token available)**

Run:
```bash
SLACK_TOKEN=$(cat config/.token 2>/dev/null || echo "$SLACK_TOKEN") \
  docker compose run --rm archiver
```

Expected: the archiver connects to Slack, downloads channels, exits 0. `./data/` is populated with `channels.json`, `users.json`, etc.

Common failures:
- `ENOENT: no such file or directory, open '.token'` — token file path mismatch. Inside the container it's `/app/slack-archive/config/.token` (from `CONFIG_DIR` in Task 2). Verify the bind mount target is correct.
- `Cannot find module 'archive/dist/cli.js'` — runtime stage of the Dockerfile didn't copy the built CLI. Rebuild with `docker compose build archiver --no-cache`.

- [ ] **Step 4: Run with `--snapshot` flag**

Run:
```bash
SLACK_TOKEN=$(cat config/.token 2>/dev/null || echo "$SLACK_TOKEN") \
  docker compose run --rm archiver --snapshot
```

Expected: completes successfully, and `./backups/<TODAY>/` exists with a full copy of `./data/`.

Run: `ls backups/`

Expected: one or more `YYYY-MM-DD` directories. Today's date should be present.

- [ ] **Step 5: Verify rotation keeps 5**

Run: `ls backups/ | wc -l`

Expected: 5 or fewer. If Stage 5's `rotateSnapshots` is working correctly and there were more than 5 pre-existing dated directories, the older ones are now gone.

No commit for this task.

---

## Task 14: Add Docker deployment section to README

**Files:**
- Modify: `README.md`

**Rationale:** The project's deployment story is only real if it's documented. Cover local quickstart, UnRAID layout, User Scripts cron recipes, and how to debug a stopped archiver.

- [ ] **Step 1: Read current README length**

Run: `wc -l README.md`

Expected: some number of lines — we'll append the Docker section, not replace existing content.

- [ ] **Step 2: Append Docker section to README**

Add the following to the end of `README.md` (preserving everything above):

```markdown

---

## Docker deployment

The new split architecture (`archive/`, `backend/`, `frontend/`) ships as two container images wired together by a `docker-compose.yml`. The archiver is a one-shot CLI invoked on a schedule; the web container is a long-running process that serves both the REST API and the built frontend SPA on a single port.

### Local quickstart

```bash
cp .env.example .env
# edit .env and set SLACK_TOKEN (or put .token in ./config/)
mkdir -p data backups config

docker compose build
docker compose up -d web              # start the web UI on http://localhost:3100
docker compose run --rm archiver      # run one archive pass
```

The `archiver` service uses `profiles: ["archive"]`, so `docker compose up -d` starts only the web container. Run the archiver explicitly with `docker compose run --rm archiver`.

### UnRAID directory layout

The stack is designed around a single appdata directory:

```
/mnt/user/appdata/slack-archive/
├── data/          canonical archive — readable by web, writable by archiver
├── backups/       dated snapshots (YYYY-MM-DD/), rotated to keep 5 most recent
└── config/
    └── .token     Slack user token (alternative to SLACK_TOKEN env var)
```

Bind these into the containers via the env var overrides in `.env` (or via the UnRAID Docker template):

- `DATA_DIR=/mnt/user/appdata/slack-archive/data`
- `BACKUPS_DIR=/mnt/user/appdata/slack-archive/backups`
- `CONFIG_DIR=/mnt/user/appdata/slack-archive/config`
- `WEB_PORT=3100` (or whatever host port you want to publish)

### Scheduled runs (UnRAID User Scripts)

Install the **User Scripts** plugin from Community Applications. Add two scripts:

**Daily archive** (suggested schedule: `0 1 * * *` — 01:00):
```bash
#!/bin/bash
cd /mnt/user/appdata/slack-archive
docker compose run --rm archiver
```

**Weekly snapshot** (suggested schedule: `0 2 * * 0` — Sunday 02:00):
```bash
#!/bin/bash
cd /mnt/user/appdata/slack-archive
docker compose run --rm archiver --snapshot
```

The `--rm` flag ensures archiver containers don't accumulate. User Scripts captures the command's stdout/stderr, so you can review each run's output from the plugin UI.

### Debugging a stopped archiver

The archiver container uses `ENTRYPOINT ["node", "archive/dist/cli.js"]`, which means arguments appended to `docker compose run` go straight to the CLI. This is convenient for passing `--snapshot` but makes shell access slightly less obvious.

**View logs from the most recent run.** If the run was invoked via `run --rm`, the container is already gone — capture stdout directly:
```bash
docker compose run --rm archiver 2>&1 | tee /tmp/archive-$(date +%F).log
```

If you drop `--rm` for active debugging, the stopped container persists and you can inspect it:
```bash
docker compose run --name archiver-debug archiver    # no --rm
docker compose logs archiver-debug
docker inspect archiver-debug
docker rm archiver-debug                              # clean up when done
```

**Shell into the image (bypass ENTRYPOINT).** To get an interactive shell in the runtime image:
```bash
docker compose run --rm --entrypoint bash archiver
```
You'll land in `/app`. The built CLI is at `archive/dist/cli.js`; bind-mounted state is under `/app/slack-archive/{data,backups,config}`. Inspect `.last-successful-run`, run the CLI manually with different flags, or tail files in `data/`.

**Rerun the CLI manually from the shell.** Once inside the container:
```bash
node archive/dist/cli.js --help
node archive/dist/cli.js                 # full run
node archive/dist/cli.js --snapshot      # run + snapshot
```
```

- [ ] **Step 3: Verify the README renders correctly**

Run: `tail -60 README.md`

Expected: the Docker section appears at the end, properly formatted, with code blocks closed.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add Docker deployment section with UnRAID instructions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 15: Delete legacy placeholder `Dockerfile` at repo root

**Files:**
- Delete: `Dockerfile`

**Rationale:** The 0-byte `Dockerfile` at the repo root is a leftover from an earlier attempt. It's not buildable, it's already excluded by `.dockerignore`, but leaving it in the tree is confusing. Delete it now.

- [ ] **Step 1: Confirm the file is empty and safe to remove**

Run: `wc -c Dockerfile`

Expected: `0 Dockerfile`. If it's non-zero, stop — someone wrote something into it and it's no longer safe to delete without investigation.

- [ ] **Step 2: Delete the file**

Run: `rm Dockerfile`

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add -u Dockerfile
git commit -m "chore: remove empty legacy Dockerfile at repo root

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 16: Stage 6 wrap — mark stage complete

**Files:**
- Modify: `docs/rebuild-plan.md` (Stage 6 section — add "Status: COMPLETE" or similar if the document uses that pattern)

**Rationale:** Leave a marker on the rebuild plan so future sessions (or future-you) can see at a glance which stages are done.

- [ ] **Step 1: Read current Stage 6 section**

Run: `grep -A 6 "^### Stage 6" docs/rebuild-plan.md`

Expected: the Stage 6 heading and its bullet list from the rebuild plan.

- [ ] **Step 2: Add a completion marker**

Edit `docs/rebuild-plan.md`, find the line:
```markdown
### Stage 6 — Dockerize
```
Change it to:
```markdown
### Stage 6 — Dockerize  *(COMPLETE — 2026-04-13)*
```

- [ ] **Step 3: Commit**

```bash
git add docs/rebuild-plan.md
git commit -m "docs: mark Stage 6 complete in rebuild plan

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 4: Show the stage log**

Run: `git log --oneline -20`

Expected: Stage 6 commits are visible, starting with the version pinning (Task 1) and ending with the rebuild plan marker.

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by task |
|---|---|
| §4 Base image + Node/pnpm pinning | Task 1 |
| §5 archiver Dockerfile | Task 9 |
| §6 web Dockerfile | Task 10 |
| §7 `.dockerignore` | Task 8 |
| §8 Backend SPA fallback | Tasks 5, 6 |
| §9 Frontend relative URLs + Vite proxy | Tasks 3, 4 |
| §10 Archive `TOKEN_FILE` move | Task 2 |
| §11 `docker-compose.yml` | Task 11 |
| §12 `.env.example` | Task 11 |
| §13 README updates | Task 14 |
| §14 Testing strategy | Tasks 7 (dev smoke), 12 (web smoke), 13 (archiver smoke) |
| §15 Non-goals | N/A — enforced by not adding tasks for them |
| §16 Risks | Addressed inline in Tasks 6, 9, 10 (error handling notes), 13 (debugging guidance) |
| §17 Sequencing | Task list matches §17 order, with dev-smoke-test (Task 7) inserted between code changes and Docker work |

**Placeholder scan:** no TBDs, no "add appropriate X", every command and code block is concrete.

**Type consistency:**
- `CONFIG_DIR`, `TOKEN_FILE` exported from `archive/src/config.ts` — used consistently across Task 2.
- `FRONTEND_DIST_DIR` exported from `backend/src/config.ts` — defined in Task 5, imported in Task 6.
- Package names match `package.json` reality: `@slack-archive/archiver`, `slack-archive-backend`, `frontend`, `@slack-archive/types`.

**Gaps fixed:** none found on review.

---

## Execution handoff

Plan complete and committed. Stage 6 requires a real Docker daemon and (for Task 13) a Slack token against a test workspace. Task 7's dev-stack smoke test is critical — it catches regressions from the three code changes before the Docker layer adds an extra debugging surface.
