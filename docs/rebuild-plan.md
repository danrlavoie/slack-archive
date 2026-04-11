# Slack Archive Rebuild — Design & Roadmap

**Status:** Draft, 2026-04-11. Supersedes the ad-hoc refactor started June 2025.
**Branch:** `refactor/rebuild-plan` (off `main` @ `f15c551`).
**Scope:** Architectural direction only. Per-stage TDD task plans will be written at the start of each stage, not in this document.

---

## 1. Why this document exists

The repo has been idle for ~10 months. A multi-package refactor was started in June 2025 and abandoned partway through. Before resuming, we need:

1. A shared mental model of the target system.
2. Explicit architectural decisions (some of which are still open).
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
- **Modern React + Vite web app** served over HTTP on a mapped port, reachable from anywhere on the home LAN.
- **URL-addressable deep links** — routing by workspace → channel → thread → message, so individual messages have shareable URLs.
- **Embedded search** — a search box inside the web app that navigates to a message's deep link when you click a result. No more separate static search page.
- **Primarily static or server-rendered** — the shell of the site should not require a heavy JS runtime to render the first view. Interactive bits (search, anchoring) can be islands of React.

### Non-goals

- Multi-user authentication / access control. It's a single-user home deployment.
- Live Slack integration (threading, reactions in real time). Read-only archive.
- Multi-workspace support as a v1 feature — the URL scheme should leave room for it, but a single workspace is enough for v1.

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

### 7.1 Rendering model — SPA vs SSG vs SSR  *(OPEN — needs your input)*

The vision says "primarily static or server-rendered, for maintainability." This conflicts with the current `frontend/` which is a runtime SPA. Three realistic options:

**Option A — Keep it an SPA.**
- Simplest path to "working." ~70% of the frontend is already built.
- `web` container serves `index.html` + static JS/CSS; all routes resolve via client-side React Router; data fetched at runtime from `/api/*`.
- First paint requires JS; URL deep-links are transparent to search engines (but this is a private LAN app, SEO is not a concern).
- ~1–2 stages of work to finish.

**Option B — Static Site Generation at archive time.**
- When the archiver finishes, it also generates all per-channel/per-thread HTML pages from the data JSON. The frontend becomes a pre-rendered static site, with small React islands for interactivity (search, expand thread, etc.).
- Fast loads. Robust to JS failures. Works even with the `web` container down (nginx could serve the files).
- More work: a build pipeline that runs as part of archiver, a framework choice (Astro is the natural fit; the current Vite + React setup is not designed for SSG and would need to be replaced or significantly augmented).
- Throws away a meaningful amount of the existing `frontend/` work.

**Option C — Vite SSR.**
- Vite has SSR support; frontend renders on-request in the `web` container using the same React components.
- Middle ground. Keeps the existing component tree. Server handles first-render; hydration makes it interactive.
- Most complex of the three. More moving parts at runtime.

**Recommendation:** Start with **Option A** for v1. It reaches a working end-to-end system fastest and preserves the existing `frontend/` work. If maintainability becomes a pain point later, migrating to Astro (Option B) is a well-trodden path and the data layer (`archive/` + `backend/`) is independent of the rendering choice.

**If you'd rather start with B or C, flag it and this plan gets re-scoped.**

### 7.2 URL scheme

Proposed route table (for Option A; identical for B/C):

```
/                                        → index / recent channels
/c/:channelId                            → channel view, paginated
/c/:channelId/m/:messageTs               → channel anchored to message
/c/:channelId/t/:threadTs                → thread view
/c/:channelId/t/:threadTs/m/:messageTs   → thread anchored to reply
/search?q=...                            → search results page
```

Slack timestamps (`ts` values like `1718745600.123456`) are URL-safe. No workspace dimension in v1, but the route tree is a prefix of `/ws/:workspaceId/...` so a future multi-workspace version can extend without breaking links.

### 7.3 Scheduling

**Decision: external scheduler, not in-container cron.**

The `archiver` container stays a pure one-shot CLI. Scheduling lives outside of it. Options for the host:

- **UnRAID "User Scripts" plugin** invoking `docker run --rm slack-archive-archiver` on a cron. Idiomatic for UnRAID. Recommended default.
- **`docker-compose` with a `restart: "no"` service triggered via a sidecar cron container** (e.g., `mcuadros/ofelia`). Idiomatic for non-UnRAID docker hosts.
- **systemd timer** on the host.

The plan should ship with a documented User Scripts recipe but not hard-code the choice.

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

### 7.5 Package topology

**Decision: keep the three-package split and add a shared types package.**

```
archive/              → @slack-archive/archiver      (unchanged)
backend/              → @slack-archive/server        (rename for clarity)
frontend/             → @slack-archive/web           (rename for clarity)
packages/types/       → @slack-archive/types         (new — per TODO.md)
pnpm-workspace.yaml   → new, promotes root to a pnpm workspace
```

Make the whole repo a pnpm workspace. Shared types become a workspace package that the other three depend on via `workspace:*`. This finally kills the cross-package imports and the type duplication.

### 7.6 Search

**Decision: embedded search, search index served as JSON via `/api/search`.**

The `archive/src/search.ts` module already builds a search index during the archive run. Current shape (from reading the source):

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
- Navigation: clicking a result → route to `/c/:channelId/m/:messageTs`, leveraging the anchoring work from commit `49aab45`.

No server-side search engine, no Elasticsearch. The JSON index is the whole database.

---

## 8. Staged rollout

Each stage is a self-contained branch + PR (or merge) that leaves the repo in a working state. Stages 0–2 unblock everything else; stages 3–7 can be reordered somewhat.

### Stage 0 — Close the books

Goal: start from a known clean state, preserve the old work for reference.

- [x] Commit uncommitted prettier/import-fix changes to `wip/archive-formatting-import-fix` branch. *(done during plan creation)*
- [x] Create `refactor/rebuild-plan` branch off `main @ f15c551`. *(this branch)*
- [ ] Land this plan doc on `refactor/rebuild-plan`.
- [ ] Push `main` to `origin/main` (13 commits behind).
- [ ] Decide: is this rebuild happening on `main` directly or on a long-lived `refactor/rebuild` branch? (Recommendation: use `refactor/rebuild-plan` as the long-lived branch, merge stage-by-stage PRs into it, fast-forward `main` when v1 is working end-to-end.)

**Exit:** Plan lives on `refactor/rebuild-plan`. Open items are written down. No code changes yet.

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

### Stage 3 — Shared types package

Goal: eliminate the three copies of `types/slack.ts`.

- Convert root to pnpm workspace (`pnpm-workspace.yaml` + root `package.json`).
- Create `packages/types/` per the existing `TODO.md` sketch. Export re-wrapped Slack API types, the `ArchiveMessage`, `SearchFile`, `SlackArchiveData`, etc. shapes.
- Update `archive/`, `backend/`, `frontend/` to depend on `workspace:*`.
- Delete local copies of the same types from each package.

**Exit:** One source of truth for types. `pnpm install && pnpm build` from root works.

### Stage 4 — Deep linking + embedded search

Goal: the vision items D and E (routing + embedded search).

- URL scheme from §7.2 implemented in the frontend router.
- Search UI: modal or page, client-side filter over the index from `/api/search`, navigation to deep links on select.
- Anchoring: integrate with the existing anchoring work from `49aab45` so `/c/:id/m/:ts` scrolls to and highlights the message.

**Exit:** You can copy a URL to a specific message, paste it in a new tab, and land on that message with it highlighted.

### Stage 5 — Backup rotation inside the archiver

Goal: the vision item C (weekly snapshot with 5-backup rotation).

- Add `--snapshot` flag (or `SLACK_ARCHIVE_SNAPSHOT=1` env var) to the archiver CLI.
- New module `archive/src/utils/snapshot.ts` (or extend `backup.ts`) that:
  - After a successful archive run, copies `DATA_DIR` to `BACKUPS_DIR/YYYY-MM-DD/`.
  - Lists `BACKUPS_DIR`, sorts by the YYYY-MM-DD directory name, keeps the most recent 5, deletes the rest.
- Mark the shell scripts (`backup.sh`, `cleanup.sh`) as deprecated — leave them in place for the legacy flow until Stage 8 but add a deprecation header.

**Exit:** `pnpm --filter archiver start -- --snapshot` produces a dated backup and prunes old ones. Verified by running it 6+ times with faked dates or by unit-testing the rotation logic.

### Stage 6 — Dockerize

Goal: two buildable container images and a `docker-compose.yml`.

- `archive/Dockerfile` — multi-stage build, copies `packages/types/` + `archive/`, installs, runs `pnpm build`, produces a slim runtime image. Entrypoint: `node dist/cli.js`.
- `web/Dockerfile` — multi-stage build. Stage 1 builds the frontend (`pnpm --filter web build`). Stage 2 runs the backend with the built frontend assets served from `public/` (extend `server.ts` to serve static files as a fallback after `/api/*` routes).
- `docker-compose.yml` at root with `archiver` (restart: no) and `web` (restart: unless-stopped) services, both mounting `./data` and `./backups` bind volumes.
- Document the full `/mnt/user/appdata/slack-archive/` layout in the README.

**Exit:** `docker compose up -d web` serves the site on a mapped port. `docker compose run --rm archiver` runs a fresh archive pass.

### Stage 7 — UnRAID deployment

Goal: running on the real UnRAID box.

- Push both images to a registry (GHCR or Docker Hub, under your namespace).
- UnRAID Docker templates for each container (XML files checked into `unraid/` directory for reproducibility).
- User Scripts recipe for daily archive + weekly snapshot.
- Document the token-setup flow specific to UnRAID (where to put `.token`, what env vars to set in the template).
- First real production run. Monitor backups directory over 2 weeks to verify rotation works.

**Exit:** The system runs on UnRAID unattended for a full week without intervention.

### Stage 8 — Retire the legacy stack

Goal: single codebase.

- Delete root `src/`, `bin/`, `static/`, root `package.json`, `yarn.lock`, `Dockerfile`, `exec_archive.sh`, `backup.sh`, `cleanup.sh`, `archive-nginx.conf`.
- Update root `README.md` to point at the new architecture exclusively.
- Keep the attachment-rendering work from `840afe6` in mind — the equivalent rendering logic needs to exist in `frontend/src/components/Message.tsx` / `Attachment.tsx` (verify during Stage 2 that it does).

**Exit:** `git log --diff-filter=D --name-only --since=Stage8.start` shows the legacy files removed. `README.md` is coherent.

---

## 9. Open questions

These need your input before Stage 1 starts. None of them block landing this plan doc.

1. **Rendering model:** A, B, or C from §7.1? *My recommendation is A, but it's your call.*
2. **Backup dir location:** `/appdata/slack-archive/backups/` as a sibling of `data/`, or inside `data/backups/` so a single bind mount covers both? *Recommendation: sibling. Cleaner separation.*
3. **Registry:** GHCR under `danrlavoie` or Docker Hub? Or build locally on UnRAID and skip the registry entirely? *Local build is simplest for a private single-user app.*
4. **Workspace naming in URLs:** reserve `/ws/:workspaceId/` prefix now (future-proof) or keep routes workspace-less for v1 and add the prefix later if multi-workspace becomes a real ask? *Recommendation: reserve the prefix now; cost is ~zero.*
5. **Shell scripts:** delete in Stage 8 or keep them indefinitely as an escape hatch for running the legacy stack? *Recommendation: delete. Parallel implementations are a maintenance tax.*
6. **Long-lived branch:** merge stages into `refactor/rebuild-plan` and fast-forward `main` when v1 works, or merge each stage into `main` as it lands? *Recommendation: long-lived branch until v1, then single fast-forward merge. The legacy stack keeps running on `main` until then.*

---

## 10. Things I want to remember

Not architectural decisions, but known hazards to preserve across stages:

- **`cleanup.sh:16` bug.** Root cause of the disk-space failure. Documented so the new rotation code in Stage 5 doesn't repeat the pattern (no `ls` without an explicit directory argument; no string-parsing of `ls` output at all — use `fs.readdirSync`).
- **`fs.statSync().isDirectory` is a method.** Two places in the current code destructure it as if it were a property. Lint rule / code review awareness.
- **Slack types drift.** The frontend's hand-written `types/slack.ts` was written against an earlier assumption about the archiver's output and may not match what the archiver actually writes. This is the real motivation for Stage 3 (shared types).
- **ESM entrypoint patterns.** Never use `require.main === module` in a `"type": "module"` package. Use `import.meta.url === \`file://${process.argv[1]}\`` or just drop the guard for CLI entrypoints.
- **Attachment rendering.** `840afe6` added message-embed rendering to the legacy static site. Verify the equivalent exists in `frontend/src/components/Attachment.tsx` before Stage 8 deletes the legacy path.
