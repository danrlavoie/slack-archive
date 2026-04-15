# Slack Archive Rebuild — Design & Roadmap

**Status:** Decisions locked, 2026-04-11. Supersedes the ad-hoc refactor started June 2025.
**Branch:** `refactor/rebuild-plan` (off `main` @ `f15c551`). Stages merge into this branch; fast-forward merge to `main` when v1 is done.
**Scope:** Architectural direction only. Per-stage TDD task plans will be written at the start of each stage, not in this document.

---

## 1. Why this document exists

The repo has been idle for ~10 months. A multi-package refactor was started in June 2025 and abandoned partway through. Before resuming, we need:

1. A shared mental model of the target system.
2. Explicit architectural decisions (all resolved — see §7).
3. A staged path where each stage produces something working and testable.
4. A record of the known bugs and loose ends so they're not re-discovered the hard way.

This is a **design document**, not an implementation plan. Each stage below will get its own TDD-granular task plan when it's time to execute it.

---

## 2. Upstream status

- Fork of `felixrieseberg/slack-archive`.
- Upstream is dormant. The most recent upstream commit (`4ce7b36`, 2025-02-23) is the same commit as our current merge base. **No upstream changes to incorporate.**
- The original maintainer's project is safe to treat as frozen.

## 3. What we changed relative to upstream (confirmed from git)

- `840afe6` (2024-06-25) — message attachments in static HTML output (`src/create-html.tsx`, `static/style.css`).
- `745efcb` (2024-07-05) — `exec_archive.sh`, `backup.sh`, `cleanup.sh` automation scripts.
- `645edbe` / `6b13bca` (2024-07-05) — `archive-nginx.conf` and fixes for nginx hosting.
- `86e2817` / `1e6372a` — small script/README tweaks.
- May–June 2025 — started a three-package refactor (`archive/`, `backend/`, `frontend/`) and partially built it.

---

## 4. Current state of the repo

**Two parallel implementations coexist.**

### Legacy monolith (working, in production)
- Root `src/`, `bin/`, `static/`, `package.json`. Yarn, React 17, TypeScript 4.7, `@slack/web-api` v6.
- `yarn prepublishOnly && npx slack-archive` is the entrypoint. Downloads Slack data *and* server-renders static HTML to `slack-archive/`.
- Automation scripts in `exec_archive.sh` / `backup.sh` / `cleanup.sh` target this output.
- `cleanup.sh` has a bug: it runs `ls -c` in the wrong directory, so old backups are never actually deleted. This is the root cause of the disk-space failures we saw in production.

### New split architecture (unfinished)
- `archive/` — `@slack-archive/archiver`, pnpm, TS 5.8, `@slack/web-api` v7. Copy-and-modernize of the legacy archiver. Writes JSON to `slack-archive-new/data/`.
- `backend/` — Express API on port 3001, reads JSON from `slack-archive/data/` (legacy path — **mismatched** with where the archiver now writes).
- `frontend/` — Vite + React 19 + React Router + TanStack Query SPA. Has a working channel sidebar, message rendering, attachments, and message anchoring.

**Known loose ends in the new stack:**

1. **`archive/` doesn't run.** Its entrypoint guard is `if (require.main === module)` in `archive/src/cli.ts:164`, but the package is `"type": "module"`. In ESM, `require` is undefined — the `main()` call is dead code.
2. **Data path mismatch.** Archive writes to `slack-archive-new/`, backend reads from `../../slack-archive/`. Either is wrong depending on which we standardize on.
3. **Latent `fs.statSync` bug.** `archive/src/utils/backup.ts:159` destructures `{ isDirectory }` from a `Stats` object, but `isDirectory` is a method, not a property. `if (!isDirectory) continue` never triggers; any file named `data_backup_*` would be treated as a directory.
4. **No shared types package.** `archive/`, `backend/`, and `frontend/` each re-derive Slack types from `@slack/web-api`. `TODO.md` describes a planned `@slack-archive/types` package that does not exist.
5. **13 commits on local `main` are unpushed to `origin/main`.** All the new-architecture commits (`5108076` onward) live only on this machine.

---

## 5. Target state (the vision)

A self-hosted Slack archive running unattended on UnRAID with the following properties:

- **Deployable as one `docker-compose.yml`** pulling from UnRAID's Community Applications ecosystem or a private registry. Config via env vars + bind mounts into `/mnt/user/appdata/slack-archive/`.
- **Daily unattended archive runs** against Slack, fetching new/updated messages, files, avatars, and emoji.
- **Weekly snapshot backups** of the data directory into `/appdata/slack-archive/backups/`, with automatic rotation keeping the most recent 5.
- **Modern React + Vite SPA** served over HTTP on a mapped port, reachable from anywhere on the home LAN. Treated as a "frontend v2" — the existing `frontend/` code is reference material, not a baseline to patch. We're free to redesign the component tree and routing from scratch.
- **URL-addressable deep links** — routing by workspace → channel → thread → message, so individual messages have shareable URLs. Workspace dimension (`/ws/:workspaceId/`) included from day one for future-proofing.
- **Embedded search** — a search box inside the web app that navigates to a message's deep link when you click a result. No more separate static search page.
- **Images published to `ghcr.io/danrlavoie/slack-archive`** for both containers.

### Non-goals

- Multi-user authentication / access control. It's a single-user home deployment.
- Live Slack integration (threading, reactions in real time). Read-only archive.
- Multi-workspace support as a v1 feature — the URL scheme includes the workspace prefix for future-proofing, but a single workspace is enough for v1.

---

## 6. Proposed architecture

```
             ┌───────────────────────────────────────────────┐
             │  UnRAID host                                  │
             │                                               │
             │  /mnt/user/appdata/slack-archive/             │
             │    ├── data/          (canonical archive)     │
             │    ├── backups/       (weekly snapshots)      │
             │    │     ├── 2026-04-05/                      │
             │    │     └── 2026-04-12/                      │
             │    └── config/                                │
             │          └── .token                           │
             │                                               │
             │  docker-compose up -d:                        │
             │                                               │
             │  ┌─────────────────┐   ┌───────────────────┐  │
             │  │ archiver        │   │ web               │  │
             │  │ (oneshot)       │   │ (long-running)    │  │
             │  │                 │   │                   │  │
             │  │ pnpm --filter   │   │ express +         │  │
             │  │   archiver start│   │ static vite build │  │
             │  │                 │   │ serves /api/* and │  │
             │  │ triggered by    │   │ /* (SPA routes)   │  │
             │  │ cron/schedule   │   │                   │  │
             │  └────────┬────────┘   └─────────┬─────────┘  │
             │           │ writes                │ reads     │
             │           └────────►  data/  ◄────┘           │
             │           │ writes                            │
             │           └────────►  backups/                │
             │                                               │
             └───────────────────────────────────────────────┘
```

**Two containers, not three.**

- `archiver` is a one-shot container. It runs the CLI, exits when done. A scheduler (see §7.3) invokes it on a cadence.
- `web` is a single long-running container that serves both the backend API (`/api/*`) and the statically-built frontend (`/*`). Combining them removes the need for a reverse proxy inside the stack and halves the moving parts.

The shared state between the two containers is the bind mount to `data/` — they communicate exclusively through the filesystem.

---

## 7. Architectural decisions

### 7.1 Rendering model — SPA  *(DECIDED)*

**SPA (React + Vite + React Router).** The `web` container serves `index.html` + static JS/CSS; all routes resolve via client-side React Router; data fetched at runtime from `/api/*`. First paint requires JS, but this is a private LAN app — SEO is not a concern.

The existing `frontend/` is **reference material, not a baseline.** This is "frontend v2" — the component tree, routing, and data-fetching layer will be designed from scratch. Patterns and components from the old `frontend/` that still make sense can be pulled forward selectively, but we're not obligated to preserve any of it.

### 7.2 URL scheme

Route table:

```
/                                                        → index / workspace list (v1: single workspace redirect)
/ws/:workspaceId                                         → workspace home / recent channels
/ws/:workspaceId/c/:channelId                            → channel view, paginated
/ws/:workspaceId/c/:channelId/m/:messageTs               → channel anchored to message
/ws/:workspaceId/c/:channelId/t/:threadTs                → thread view
/ws/:workspaceId/c/:channelId/t/:threadTs/m/:messageTs   → thread anchored to reply
/ws/:workspaceId/search?q=...                            → search results page
```

Slack timestamps (`ts` values like `1718745600.123456`) are URL-safe. The `/ws/:workspaceId` prefix is included from day one at effectively zero cost — v1 uses a single workspace but the URL scheme is ready for multi-workspace without breaking existing links.

### 7.3 Scheduling  *(DECIDED)*

**External scheduler. Paved path: UnRAID User Scripts plugin.**

The `archiver` container is a pure one-shot CLI: run, archive, exit. It knows nothing about scheduling. The host is responsible for invoking it on a cadence.

- **Paved path:** UnRAID "User Scripts" plugin invoking `docker compose run --rm archiver` daily and `docker compose run --rm archiver --snapshot` weekly.
- **Alternative paths (documented but not maintained):** sidecar cron container (e.g., `mcuadros/ofelia`), systemd timer, bare crontab.

The README ships with a copy-paste User Scripts recipe for both the daily and weekly jobs.

### 7.4 Backup & rotation

**Decision: move backup responsibility into the archiver, not a separate container or shell script.**

Reasons:
- It already has `fs-extra`, `logger`, `trash`, and a working config for data paths.
- Shell-script rotation has already failed once in production.
- Running it in the archiver container means it shares the same bind mount and runs in the same process supervision scope as the archive run.

Two distinct behaviors, currently conflated:

1. **Transient pre-run safety backup** — the current `archive/src/utils/backup.ts` behavior. Copy `data/` to `data_backup_<timestamp>/` before the run, delete it on success. **Keep this.** Fix the `fs.statSync` bug (§4).
2. **Periodic preservation snapshots** — new. On a schedule (default: once per week, controlled by `--snapshot` CLI flag or env var), after a successful archive, copy `data/` to `backups/YYYY-MM-DD/`. Rotate to keep the 5 most recent.

The periodic snapshot is a new code path. The scheduler (§7.3) triggers it by running `slack-archive-archive --snapshot` once a week instead of the default daily run.

The legacy `backup.sh` and `cleanup.sh` are retired in Stage 8.

### 7.5 Package topology  *(DECIDED)*

**Three-package split + shared types with Zod.**

```
archive/              → @slack-archive/archiver      (unchanged)
backend/              → @slack-archive/server        (rename for clarity)
frontend/             → @slack-archive/web           (rename for clarity)
packages/types/       → @slack-archive/types         (new — per TODO.md)
pnpm-workspace.yaml   → new, promotes root to a pnpm workspace
```

Make the whole repo a pnpm workspace. Shared types become a workspace package that the other three depend on via `workspace:*`. This kills the cross-package imports and type duplication.

**Types use Zod schemas as the source of truth.** Each shared type is defined as a Zod schema; TypeScript types are inferred via `z.infer<>`. This gives us:
- Runtime validation at the boundary where the backend serves data and the frontend consumes it.
- A single schema that is both the type definition and the contract.
- The archiver can also use Zod schemas to validate what it reads from Slack before writing to disk — but this is optional and lower priority than the frontend/backend contract.

### 7.6 Search  *(DECIDED, with verification caveat)*

**Embedded search, search index served as JSON via `/api/search`.**

The `archive/src/search.ts` module builds a search index during the archive run. Current shape (from reading the source):

```ts
SearchFile = {
  users: Record<string, string>
  channels: Record<string, string>
  messages: Record<string, SearchMessage[]>  // keyed by something — verify
  pages: SearchPageIndex
}
```

The backend already has `/api/search` serving this. The frontend needs:
- A search UI component (modal or dedicated page).
- A client-side filter over the loaded index (the index is small enough — thousands of messages, not millions).
- Navigation: clicking a result → route to `/ws/:workspaceId/c/:channelId/m/:messageTs`, leveraging the anchoring work from commit `49aab45`.

No server-side search engine, no Elasticsearch. The JSON index is the whole database.

**Verification caveat:** `archive/src/search.ts` was written in a single June 30 session and never exercised against the new frontend. During Stage 2 (wiring backend+frontend), we need to verify the index shape matches what the frontend search UI actually needs. If the index structure is wrong, fix it in the archiver before building the search UI in Stage 4.

---

## 8. Staged rollout

Each stage is a self-contained branch + PR (or merge) that leaves the repo in a working state. Stages 0–2 unblock everything else; stages 3–7 can be reordered somewhat.

### Stage 0 — Close the books

Goal: start from a known clean state, preserve the old work for reference.

- [x] Commit uncommitted prettier/import-fix changes to `wip/archive-formatting-import-fix` branch.
- [x] Create `refactor/rebuild-plan` branch off `main @ f15c551`.
- [x] Land this plan doc on `refactor/rebuild-plan`.
- [x] Resolve all open questions (§9) — all decisions locked.
- [ ] Push `main` to `origin/main` (13 commits behind).

**Branch strategy (decided):** Stages merge into `refactor/rebuild-plan`. When v1 is working end-to-end, fast-forward merge to `main`. The legacy stack keeps running on `main` until then.

**Exit:** Plan lives on `refactor/rebuild-plan`. All decisions locked. No code changes yet.

### Stage 1 — Make the archiver actually run

Goal: `pnpm --filter @slack-archive/archiver start` downloads a real Slack workspace end-to-end.

- Fix `archive/src/cli.ts:164` ESM entrypoint bug. Use `import.meta.url`-based detection or just drop the guard and invoke `main()` unconditionally at module load.
- Standardize `OUT_DIR`: pick ONE canonical path. Recommendation: `OUT_DIR = process.env.SLACK_ARCHIVE_DATA_DIR ?? path.join(process.cwd(), "slack-archive")`. Align `backend/src/config.ts` to the same env var. Delete `slack-archive-new` as a concept.
- Fix `archive/src/utils/backup.ts:159` `fs.statSync().isDirectory()` bug.
- Manual smoke test: run against a real (small) Slack workspace. Verify `data/*.json`, emoji, avatar, files download. Verify search index is written.

**Exit:** Archiver runs clean, populates `data/`, exits 0.

### Stage 2 — Wire backend + frontend to the same data

Goal: with data already on disk from Stage 1, the frontend renders it end-to-end.

- Point backend at the same canonical data dir from Stage 1.
- `pnpm --filter @slack-archive/server dev` + `pnpm --filter @slack-archive/web dev` — load a channel, see messages, click a message, get a URL with the message ts.
- Verify the `/api/*` endpoints (`channels`, `messages/:channelId`, `users`, `emoji`, `search`) all return data.
- Fix whatever breaks, which will likely include: type drift since the frontend's hand-written `types/slack.ts` vs what the archiver actually writes; message rendering edge cases.

**Exit:** Local dev stack renders a real archive in the browser.

### Stage 3 — Shared types package (Zod)

Goal: eliminate the three copies of `types/slack.ts`. Establish runtime-validated type contracts.

- Convert root to pnpm workspace (`pnpm-workspace.yaml` + root `package.json`).
- Create `packages/types/` with Zod schemas as the source of truth for all shared types: `Channel`, `Message`, `ArchiveMessage`, `User`, `SearchFile`, `SlackArchiveData`, `Emoji`, etc.
- TypeScript types inferred via `z.infer<>` — no separate interface definitions.
- Update `archive/`, `backend/`, `frontend/` to depend on `@slack-archive/types` via `workspace:*`.
- Backend uses Zod `.parse()` / `.safeParse()` at the API boundary when serving data. Frontend can validate responses at fetch time.
- Delete local copies of the same types from each package.

**Exit:** One source of truth for types and validation. `pnpm install && pnpm build` from root works.

### Stage 4 — Frontend v2: deep linking + embedded search

Goal: the vision items D and E (routing + embedded search). This is a fresh frontend build, not a patch of the old `frontend/`.

- Full URL scheme from §7.2 implemented in the frontend router (including `/ws/:workspaceId/` prefix).
- Channel sidebar, message list, thread view — designed from scratch, pulling patterns from the old `frontend/` selectively where they make sense.
- Search UI: modal or page, client-side filter over the index from `/api/search`, navigation to deep links on select.
- Anchoring: `/ws/:id/c/:channelId/m/:ts` scrolls to and highlights the target message.
- The old `frontend/` directory stays in the tree as reference until Stage 8; the new frontend can coexist alongside it (different package name, different directory if needed, or just replace it in-place).

**Exit:** You can copy a URL to a specific message, paste it in a new tab, and land on that message with it highlighted. Search returns results and clicking one navigates to the message.

### Stage 5 — Backup rotation inside the archiver

Goal: the vision item C (weekly snapshot with 5-backup rotation).

- Add `--snapshot` flag (or `SLACK_ARCHIVE_SNAPSHOT=1` env var) to the archiver CLI.
- New module `archive/src/utils/snapshot.ts` (or extend `backup.ts`) that:
  - After a successful archive run, copies `DATA_DIR` to `BACKUPS_DIR/YYYY-MM-DD/`.
  - Lists `BACKUPS_DIR`, sorts by the YYYY-MM-DD directory name, keeps the most recent 5, deletes the rest.
- Mark the shell scripts (`backup.sh`, `cleanup.sh`) as deprecated — leave them in place for the legacy flow until Stage 8 but add a deprecation header.

**Exit:** `pnpm --filter archiver start -- --snapshot` produces a dated backup and prunes old ones. Verified by running it 6+ times with faked dates or by unit-testing the rotation logic.

### Stage 6 — Dockerize  *(COMPLETE — 2026-04-14)*

Goal: two buildable container images and a `docker-compose.yml`.

- `archive/Dockerfile` — multi-stage build, copies `packages/types/` + `archive/`, installs, runs `pnpm build`, produces a slim runtime image. Entrypoint: `node dist/cli.js`.
- `web/Dockerfile` — multi-stage build. Stage 1 builds the frontend (`pnpm --filter web build`). Stage 2 runs the backend with the built frontend assets served from `public/` (extend `server.ts` to serve static files as a fallback after `/api/*` routes).
- `docker-compose.yml` at root with `archiver` (restart: no) and `web` (restart: unless-stopped) services, both mounting `./data` and `./backups` bind volumes.
- Document the full `/mnt/user/appdata/slack-archive/` layout in the README.

**Exit:** `docker compose up -d web` serves the site on a mapped port. `docker compose run --rm archiver` runs a fresh archive pass.

### Stage 7 — UnRAID deployment  *(COMPLETE — 2026-04-15)*

Goal: running on the real UnRAID box.

- Push both images to `ghcr.io/danrlavoie/slack-archive` (archiver + web tags).
- UnRAID Docker templates for each container (XML files checked into `unraid/` directory for reproducibility).
- User Scripts recipes:
  - **Daily:** `docker compose run --rm archiver` — runs the archive pass.
  - **Weekly:** `docker compose run --rm archiver --snapshot` — runs archive + creates a dated snapshot and rotates old ones.
- Document the token-setup flow specific to UnRAID (where to put `.token` / `SLACK_TOKEN`, what env vars to set in the template).
- Directory layout documented: `/mnt/user/appdata/slack-archive/{data,backups,config}`.
- First real production run. Monitor backups directory over 2 weeks to verify rotation works.

**Exit:** The system runs on UnRAID unattended for a full week without intervention.

### Stage 8 — Retire the legacy stack

Goal: single codebase.

- Delete root `src/`, `bin/`, `static/`, root `package.json`, `yarn.lock`, `Dockerfile`, `exec_archive.sh`, `backup.sh`, `cleanup.sh`, `archive-nginx.conf`.
- Update root `README.md` to point at the new architecture exclusively.
- Keep the attachment-rendering work from `840afe6` in mind — the equivalent rendering logic needs to exist in `frontend/src/components/Message.tsx` / `Attachment.tsx` (verify during Stage 2 that it does).

**Exit:** `git log --diff-filter=D --name-only --since=Stage8.start` shows the legacy files removed. `README.md` is coherent.

---

## 9. Resolved questions

All decided 2026-04-11:

1. **Rendering model:** SPA (Option A). Frontend treated as v2 — fresh build, not a patch of the old `frontend/`.
2. **Backup dir location:** Sibling of `data/`. Layout: `/appdata/slack-archive/{data,backups,config}`.
3. **Registry:** `ghcr.io/danrlavoie/slack-archive`.
4. **Workspace prefix in URLs:** Include `/ws/:workspaceId/` from day one.
5. **Shell scripts:** Delete in Stage 8 along with the rest of the legacy stack.
6. **Branch strategy:** Stages merge into `refactor/rebuild-plan`; fast-forward merge to `main` when v1 is done.

---

## 10. Things I want to remember

Not architectural decisions, but known hazards to preserve across stages:

- **`cleanup.sh:16` bug.** Root cause of the disk-space failure. Documented so the new rotation code in Stage 5 doesn't repeat the pattern (no `ls` without an explicit directory argument; no string-parsing of `ls` output at all — use `fs.readdirSync`).
- **`fs.statSync().isDirectory` is a method.** Two places in the current code destructure it as if it were a property. Lint rule / code review awareness.
- **Slack types drift.** The frontend's hand-written `types/slack.ts` was written against an earlier assumption about the archiver's output and may not match what the archiver actually writes. This is the real motivation for Stage 3 (Zod shared types).
- **ESM entrypoint patterns.** Never use `require.main === module` in a `"type": "module"` package. Use `import.meta.url === \`file://${process.argv[1]}\`` or just drop the guard for CLI entrypoints.
- **Attachment rendering.** `840afe6` added message-embed rendering to the legacy static site. The frontend v2 (Stage 4) needs equivalent rendering before Stage 8 deletes the legacy path. Use the old `frontend/src/components/Attachment.tsx` and legacy `src/create-html.tsx` as references.
- **Search index shape.** `archive/src/search.ts` was written in one session and never validated against a consumer. Verify it during Stage 2 before building the search UI in Stage 4.
