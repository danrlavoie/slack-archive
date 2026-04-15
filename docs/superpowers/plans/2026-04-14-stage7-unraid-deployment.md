# Stage 7: UnRAID Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the slack-archive stack running on Dan's UnRAID box, fed by images published to GHCR via GitHub Actions, with UnRAID Docker templates and User Scripts recipes checked into the repo for reproducibility.

**Architecture:** A single GitHub Actions workflow (`ci.yml`) validates the pnpm workspace (install + build + lint) then publishes both Docker images to `ghcr.io/danrlavoie/slack-archive-{web,archiver}:latest` via a matrix job. UnRAID consumes the published images via two XML Docker templates (web long-running, archiver one-shot) committed under `unraid/`. A short `unraid/README.md` documents import steps, token placement, and User Scripts cron recipes for daily archive + weekly snapshot.

**Tech Stack:** GitHub Actions, `docker/build-push-action@v6`, `docker/login-action@v3`, GHCR, UnRAID Docker template XML schema, UnRAID User Scripts plugin, pnpm 10.18.3, Node 22.

**Branch:** `refactor/rebuild-plan` (commits accumulate here; fast-forward to `main` when v1 is complete).

**Stage exit criterion:** First real archive run succeeds on Dan's UnRAID box. 2-week backup rotation monitoring is tracked separately and not part of Stage 7 completion.

---

## Context: what Stage 6 already delivered

- `docker/web.Dockerfile` and `docker/archiver.Dockerfile` both build cleanly from repo root.
- `docker-compose.yml` with `web` (restart: unless-stopped) and `archiver` (profiles: archive) services, bind mounts parameterized via `DATA_DIR`, `BACKUPS_DIR`, `CONFIG_DIR`, `WEB_PORT` env vars.
- `.env.example` template committed.
- README already has a Docker deployment section covering local quickstart, UnRAID directory layout, and User Scripts scheduled runs — **Stage 7 will point that section at the checked-in XML templates rather than re-document.**
- Token path inside the archiver container: `/app/slack-archive/config/.token` (from `archive/src/config.ts` after Stage 6's `CONFIG_DIR` change).

## Context: what GitHub Actions already uses in this org

The sibling repo `~/git/game-guide/.github/workflows/ci.yml` is the reference pattern. Single workflow, `validate` job then `publish` job, `push: main` trigger, `docker/login-action@v3` + `docker/build-push-action@v6`, `latest` tag, `${{ secrets.GITHUB_TOKEN }}` for GHCR auth, `permissions: packages: write` on the publish job. Stage 7 copies this pattern and extends it to a two-image matrix.

---

## File Structure

New files:

| Path | Responsibility |
|------|---------------|
| `.github/workflows/ci.yml` | Validate (install + typecheck + lint + build) then publish both images to GHCR on push to `main` and `refactor/rebuild-plan`. Matrix job for the two Dockerfiles. |
| `unraid/slack-archive-web.xml` | UnRAID Docker template for the web container. Port 3100, read-only data bind mount, pulls `ghcr.io/danrlavoie/slack-archive-web:latest`. |
| `unraid/slack-archive-archiver.xml` | UnRAID Docker template for the archiver. Three bind mounts (data rw, backups rw, config ro), `restart: no`, `SLACK_TOKEN` env var passthrough, pulls `ghcr.io/danrlavoie/slack-archive-archiver:latest`. |
| `unraid/README.md` | How to import the templates, where `.token` goes, and User Scripts cron recipes for daily + weekly runs. |
| `docs/superpowers/plans/2026-04-14-stage7-unraid-deployment.md` | This plan. |

Modified files:

| Path | Change |
|------|--------|
| `README.md` | Update the Docker deployment section to point at `unraid/` for UnRAID template imports. Do not re-document steps already in `unraid/README.md`; just cross-link. |
| `docs/rebuild-plan.md` | Mark Stage 7 complete with `*(COMPLETE — YYYY-MM-DD)*` suffix. |

**Out of scope for Stage 7:**
- Semver tagging (`latest` only, per user decision — Dan is the only consumer).
- Multi-arch builds (UnRAID box is amd64; single-arch keeps builds fast).
- Smoke tests inside GHA (validation via existing `pnpm -r build`; runtime correctness is verified in Task 8 on the real UnRAID box).
- Renovate/Dependabot configuration.
- Automated rollback / release workflows.

---

## Task 1: Scaffold `.github/workflows/ci.yml`

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file with validate + publish jobs**

```yaml
name: CI

on:
  push:
    branches: [main, refactor/rebuild-plan]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.18.3
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build
      - run: pnpm --filter frontend lint

  publish:
    needs: validate
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      packages: write
    strategy:
      matrix:
        include:
          - image: slack-archive-web
            dockerfile: docker/web.Dockerfile
          - image: slack-archive-archiver
            dockerfile: docker/archiver.Dockerfile
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          push: true
          tags: ghcr.io/danrlavoie/${{ matrix.image }}:latest
```

- [ ] **Step 2: Verify the workflow parses locally**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
Expected: No output (valid YAML), exit code 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GHA workflow building and pushing both images to GHCR"
```

**Notes for the implementer:**
- The `pnpm/action-setup@v4` + `actions/setup-node@v4` pair is the standard pnpm-on-GHA recipe. `cache: pnpm` on setup-node works because pnpm was installed first.
- Frontend is the only package with an `eslint` script today — `pnpm --filter frontend lint` not `pnpm -r lint`.
- The `if: github.event_name == 'push'` on publish prevents PRs from publishing (PRs still run validate). Since we trigger pushes on both `main` and `refactor/rebuild-plan`, images get rebuilt on every commit to either branch.
- `${{ secrets.GITHUB_TOKEN }}` is automatically available — no manual PAT setup needed. Dan's laptop already has GitHub auth configured from other repos so `git push` will trigger the workflow cleanly.

---

## Task 2: First workflow run — verify validate + publish both succeed

**Files:** None (verification task).

- [ ] **Step 1: Push the branch**

```bash
git push origin refactor/rebuild-plan
```

- [ ] **Step 2: Watch the workflow run**

Run: `gh run watch $(gh run list --branch refactor/rebuild-plan --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: both jobs succeed. `validate` takes ~1-2 min, `publish` matrix takes ~3-5 min per image.

- [ ] **Step 3: Confirm both images are published**

Run: `gh api /users/danrlavoie/packages/container/slack-archive-web/versions --jq '.[0].metadata.container.tags'`
Expected: `["latest"]`

Run: `gh api /users/danrlavoie/packages/container/slack-archive-archiver/versions --jq '.[0].metadata.container.tags'`
Expected: `["latest"]`

- [ ] **Step 4: If the workflow fails**

Debug:
- Look at the failing step output via `gh run view --log-failed`.
- Common causes: (a) pnpm lockfile drift (`--frozen-lockfile` rejects); (b) lint failures from code Dan's editor auto-fixed locally but CI doesn't; (c) Docker build context missing files due to `.dockerignore`.
- Fix, commit, re-push. Do not merge to `main` until a green run exists on `refactor/rebuild-plan`.

**Notes for the implementer:**
- This is a verification task, not a code task — no files change. The deliverable is "both images exist in GHCR with the `latest` tag".
- **Blocker: package visibility.** On the first successful push, the packages will be created as **private** by default. Dan has said he'll enable public visibility and link them to the repo via the GitHub web UI. This is a manual step Dan handles; the implementer surfaces the packages' URLs and asks Dan to do the linking before moving to Task 6.

---

## Task 3: Create `unraid/slack-archive-web.xml`

**Files:**
- Create: `unraid/slack-archive-web.xml`

- [ ] **Step 1: Research the UnRAID template format**

UnRAID Docker templates are XML files under `/boot/config/plugins/dockerMan/templates-user/`. The schema is documented at <https://docs.unraid.net/unraid-os/manual/docker-management/#creating-your-own-templates> and via example templates in Community Applications. The minimum fields needed:
- `<Container version="2">` root
- `<Name>`, `<Repository>`, `<Registry>`, `<Network>`, `<MyIP>`, `<Shell>`, `<Privileged>`, `<Support>`, `<Project>`, `<Overview>`, `<Category>`, `<WebUI>`, `<Icon>`
- `<Config>` elements for each Port, Path, Variable, Device, Label with `Type`, `Mode`, `Default`, `Description`, `Display`, `Required`, `Mask`, and child text value
- `<DateInstalled>` and `<Changes>` can be omitted (UnRAID fills them).

- [ ] **Step 2: Write the template**

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>slack-archive-web</Name>
  <Repository>ghcr.io/danrlavoie/slack-archive-web:latest</Repository>
  <Registry>https://ghcr.io/danrlavoie/slack-archive-web</Registry>
  <Network>bridge</Network>
  <MyIP/>
  <Shell>sh</Shell>
  <Privileged>false</Privileged>
  <Support>https://github.com/danrlavoie/slack-archive/issues</Support>
  <Project>https://github.com/danrlavoie/slack-archive</Project>
  <Overview>Web UI for the slack-archive project. Serves the Express API and the built frontend SPA from a read-only bind mount of the archive data directory.</Overview>
  <Category>Tools: Productivity:</Category>
  <WebUI>http://[IP]:[PORT:3100]/</WebUI>
  <TemplateURL/>
  <Icon>https://raw.githubusercontent.com/danrlavoie/slack-archive/main/unraid/icon.png</Icon>
  <ExtraParams>--restart unless-stopped</ExtraParams>
  <PostArgs/>
  <CPUset/>
  <DateInstalled/>
  <DonateText/>
  <DonateLink/>
  <Requires/>
  <Config Name="WebUI Port" Target="3100" Default="3100" Mode="tcp" Description="HTTP port the backend listens on." Type="Port" Display="always" Required="true" Mask="false">3100</Config>
  <Config Name="Data directory" Target="/app/slack-archive/data" Default="/mnt/user/appdata/slack-archive/data" Mode="ro" Description="Read-only bind mount of the archive data directory written by the archiver container." Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/slack-archive/data</Config>
</Container>
```

- [ ] **Step 3: Validate the XML**

Run: `python3 -c "import xml.etree.ElementTree as ET; ET.parse('unraid/slack-archive-web.xml')"`
Expected: No output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add unraid/slack-archive-web.xml
git commit -m "feat(unraid): add docker template for slack-archive-web container"
```

**Notes for the implementer:**
- The `<Icon>` field points at a file that doesn't exist yet (`unraid/icon.png`). That's fine — UnRAID will fall back to a default icon if the URL 404s. Dan can add an icon later; Stage 7 does not need one.
- `Mode="ro"` on the data Path matches the docker-compose.yml (`:ro`). The web container must never write to `data/`.
- `Category` uses UnRAID's standardized taxonomy; "Tools: Productivity:" is a reasonable fit.
- Do not include `SLACK_TOKEN` on this template — the web container doesn't need it.

---

## Task 4: Create `unraid/slack-archive-archiver.xml`

**Files:**
- Create: `unraid/slack-archive-archiver.xml`

- [ ] **Step 1: Write the archiver template**

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>slack-archive-archiver</Name>
  <Repository>ghcr.io/danrlavoie/slack-archive-archiver:latest</Repository>
  <Registry>https://ghcr.io/danrlavoie/slack-archive-archiver</Registry>
  <Network>bridge</Network>
  <MyIP/>
  <Shell>sh</Shell>
  <Privileged>false</Privileged>
  <Support>https://github.com/danrlavoie/slack-archive/issues</Support>
  <Project>https://github.com/danrlavoie/slack-archive</Project>
  <Overview>One-shot archiver CLI for the slack-archive project. Fetches new Slack messages and writes them to the bind-mounted data directory. Not a long-running service — triggered manually or via UnRAID User Scripts cron.</Overview>
  <Category>Tools: Productivity:</Category>
  <WebUI/>
  <TemplateURL/>
  <Icon>https://raw.githubusercontent.com/danrlavoie/slack-archive/main/unraid/icon.png</Icon>
  <ExtraParams>--restart=no</ExtraParams>
  <PostArgs>--automatic</PostArgs>
  <CPUset/>
  <DateInstalled/>
  <DonateText/>
  <DonateLink/>
  <Requires/>
  <Config Name="Data directory" Target="/app/slack-archive/data" Default="/mnt/user/appdata/slack-archive/data" Mode="rw" Description="Read-write bind mount where the archiver writes channel JSON, users, emoji, and search index." Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/slack-archive/data</Config>
  <Config Name="Backups directory" Target="/app/slack-archive/backups" Default="/mnt/user/appdata/slack-archive/backups" Mode="rw" Description="Read-write bind mount where --snapshot runs create dated backups." Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/slack-archive/backups</Config>
  <Config Name="Config directory" Target="/app/slack-archive/config" Default="/mnt/user/appdata/slack-archive/config" Mode="ro" Description="Read-only bind mount containing the .token file with the Slack user token." Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/slack-archive/config</Config>
  <Config Name="SLACK_TOKEN" Target="SLACK_TOKEN" Default="" Mode="" Description="Optional: Slack user token. If set, takes precedence over the .token file in the config directory." Type="Variable" Display="always" Required="false" Mask="true"/>
</Container>
```

- [ ] **Step 2: Validate the XML**

Run: `python3 -c "import xml.etree.ElementTree as ET; ET.parse('unraid/slack-archive-archiver.xml')"`
Expected: No output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add unraid/slack-archive-archiver.xml
git commit -m "feat(unraid): add docker template for slack-archive-archiver container"
```

**Notes for the implementer:**
- `<PostArgs>--automatic</PostArgs>` passes `--automatic` to the archive CLI as the default mode. This matches how Dan's cron runs it. Weekly snapshot runs will override PostArgs to `--automatic --snapshot` via the User Scripts wrapper.
- `Mask="true"` on `SLACK_TOKEN` hides the value in the UnRAID UI.
- The archiver template has no `<WebUI>` because it's a one-shot container — `<WebUI/>` (self-closing) is valid.
- `--restart=no` in ExtraParams is critical: without it UnRAID will loop-restart the container after each exit.

---

## Task 5: Create `unraid/README.md`

**Files:**
- Create: `unraid/README.md`

- [ ] **Step 1: Write the README**

```markdown
# UnRAID deployment

Docker templates and User Scripts recipes for running slack-archive on UnRAID.

## Directory layout

Create these directories on your UnRAID box before importing the templates:

```
/mnt/user/appdata/slack-archive/
├── data/       # Archiver writes here; web serves from here (read-only)
├── backups/    # Archiver --snapshot dated backups
└── config/
    └── .token  # Slack user token (xoxp-... or xoxb-...)
```

Set the token file from a terminal session:

```bash
mkdir -p /mnt/user/appdata/slack-archive/config
echo 'xoxp-your-token-here' > /mnt/user/appdata/slack-archive/config/.token
chmod 600 /mnt/user/appdata/slack-archive/config/.token
```

Alternatively, set the `SLACK_TOKEN` env var on the archiver container via the UnRAID template. Env var takes precedence over the file.

See the [root README](../README.md#authentication) for how to create a Slack user token if you don't have one yet.

## Importing the templates

1. Copy the two XML files to `/boot/config/plugins/dockerMan/templates-user/` on your UnRAID box:
   ```bash
   cp slack-archive-web.xml slack-archive-archiver.xml /boot/config/plugins/dockerMan/templates-user/
   ```
2. In the UnRAID web UI, go to **Docker → Add Container**.
3. In the **Template** dropdown, select **User templates → slack-archive-web**. Review the paths and port, then click **Apply**. UnRAID pulls the image from GHCR and starts the container.
4. Repeat for **slack-archive-archiver**. On Apply, UnRAID pulls the image and runs the archiver once (the first real archive run — expect it to take a while depending on workspace size).

After the first archiver run completes, confirm `data/` is populated and open the web UI at `http://<unraid-ip>:3100/`.

## Scheduled runs via User Scripts

Install the [User Scripts](https://forums.unraid.net/topic/48286-plugin-ca-user-scripts/) plugin if you don't have it.

### Daily archive (recommended: 1:00 AM)

Create a new User Script named `slack-archive-daily`:

```bash
#!/bin/bash
docker start -a slack-archive-archiver
```

Schedule: `0 1 * * *` (cron).

`docker start -a` attaches so User Scripts captures the archiver's logs. The container exits after the run; `--restart=no` in the template prevents UnRAID from looping it.

### Weekly snapshot (recommended: 2:00 AM Sunday)

Create a second User Script named `slack-archive-weekly-snapshot`:

```bash
#!/bin/bash
docker run --rm \
  -v /mnt/user/appdata/slack-archive/data:/app/slack-archive/data \
  -v /mnt/user/appdata/slack-archive/backups:/app/slack-archive/backups \
  -v /mnt/user/appdata/slack-archive/config:/app/slack-archive/config:ro \
  ghcr.io/danrlavoie/slack-archive-archiver:latest --automatic --snapshot
```

Schedule: `0 2 * * 0` (cron).

`--snapshot` runs a normal archive pass and then writes a dated backup under `backups/YYYY-MM-DD/` and rotates old backups according to `archive/src/backup.ts`.

## Debugging a failed run

- **View last run logs:** `docker logs slack-archive-archiver`
- **Shell into the image without running the archiver:** `docker run --rm -it --entrypoint bash ghcr.io/danrlavoie/slack-archive-archiver:latest`
- **Re-run the CLI manually with different flags:** `docker run --rm -v /mnt/user/appdata/slack-archive/data:/app/slack-archive/data -v /mnt/user/appdata/slack-archive/config:/app/slack-archive/config:ro ghcr.io/danrlavoie/slack-archive-archiver:latest --help`
```

- [ ] **Step 2: Verify no dead markdown links**

Run: `grep -E '\[.*\]\(' unraid/README.md`
Expected: The two links printed (`../README.md#authentication` and the User Scripts forum link). Confirm `../README.md` exists and has an `## Authentication` or similar section; if not, change the link to point at the Slack app setup section instead.

- [ ] **Step 3: Commit**

```bash
git add unraid/README.md
git commit -m "docs(unraid): document template import, token setup, and cron recipes"
```

**Notes for the implementer:**
- **Critical:** verify the `../README.md#authentication` anchor exists before committing. The root README had duplicated sections flagged at end of Stage 6 — if the anchor doesn't exist or is ambiguous, point at a different section (e.g., `#requirements` or `#setup`) or drop the anchor entirely.
- The `docker start -a slack-archive-archiver` approach is simpler than `docker compose run --rm archiver` for UnRAID because it reuses the container UnRAID already configured via the template. The weekly snapshot uses `docker run --rm` because we need to pass extra flags (`--snapshot`) that aren't in the template's PostArgs.
- `chmod 600` on the token file is a belt-and-suspenders move — it's bind-mounted read-only into the container anyway, but restricting host-side file perms is the kind of thing Dan appreciates.

---

## Task 6: Clean up `README.md` duplication and reference `unraid/`

**Files:**
- Modify: `README.md`

**Context:** The README has a pre-existing duplication flagged at end of Stage 6: lines 122-156 (`## Automating it` → `## Hosting with nginx`) are repeated verbatim at lines 160-194, with an orphan token paragraph stranded at line 158. That orphan paragraph is redundant with the existing `## Getting a token` section (line 48). Dan has explicitly authorized cleaning this up as part of Stage 7 since we're already editing the file.

This task does two things in one commit: (a) delete the duplication + orphan, (b) replace the UnRAID subsection inside the Docker deployment block with a pointer to `unraid/README.md`.

- [ ] **Step 1: Read the current README to confirm line numbers haven't shifted**

Use the `Read` tool on `README.md` with no offset/limit. Confirm:
- Lines 122-156 are the first copy of `## Automating it` + `## Hosting with nginx`.
- Line 158 is the orphan token paragraph starting with "When you start the app, you can paste it in the command line, OR create a file called `.token`".
- Lines 160-194 are the second (duplicate) copy.
- Line 198 starts `## Docker deployment` (added in Stage 6).

If line numbers have shifted since the plan was written, locate the same content by header matching and adjust accordingly.

- [ ] **Step 2: Delete the duplicate block using `Edit` with `replace_all: false`**

Use a single `Edit` to remove the orphan token paragraph + the second copy. The `old_string` must start at the end of the first "Hosting with nginx" section and end just before the `---` separator (line 196):

Construct `old_string` as the exact text from line 156 ("Check your firewall...") through line 194 ("...start nginx to begin serving the website."). Make sure it's unique — the second copy must be present as part of the match so this doesn't fire twice accidentally.

`new_string` is just line 156's content with a trailing blank line so the `---` separator below is still spaced correctly.

Verify the resulting file has exactly one `## Automating it` and one `## Hosting with nginx`:

Run: `grep -c "^## Automating it" README.md`
Expected: `1`

Run: `grep -c "^## Hosting with nginx" README.md`
Expected: `1`

- [ ] **Step 3: Replace the UnRAID subsection with a pointer**

Inside the `## Docker deployment` block (added in Stage 6 Task 14), there's a `### UnRAID directory layout` subsection (~line 216 pre-cleanup, lower after Step 2's deletion), a `### Scheduled runs (UnRAID User Scripts)` subsection, and a `### Debugging a stopped archiver` subsection. All three are UnRAID-specific and now live in `unraid/README.md`.

Replace all three subsections with one `### UnRAID` subsection pointing at the new location. Use `Edit` with `old_string` spanning from `### UnRAID directory layout` through the end of the `### Debugging a stopped archiver` subsection (before any trailing content or EOF). `new_string`:

```markdown
### UnRAID

See [`unraid/README.md`](unraid/README.md) for deployment instructions. The checked-in Docker templates (`unraid/slack-archive-web.xml` and `unraid/slack-archive-archiver.xml`) can be copied to `/boot/config/plugins/dockerMan/templates-user/` and imported via **Docker → Add Container → User templates**.

Published images:
- `ghcr.io/danrlavoie/slack-archive-web:latest`
- `ghcr.io/danrlavoie/slack-archive-archiver:latest`
```

Preserve any `### Local quickstart` subsection that already exists inside `## Docker deployment` — that's for local development, not UnRAID, and stays.

- [ ] **Step 4: Verify the cleanup**

Run: `grep -c "^## Automating it" README.md && grep -c "^## Hosting with nginx" README.md && grep -c "^### UnRAID" README.md`
Expected: `1`, `1`, `1` on three lines.

Run: `grep -n "unraid/" README.md`
Expected: references to `unraid/README.md` and the two XML template filenames.

Run: `python3 -c "import re; t=open('README.md').read(); [print(f'line {i+1}: {l}') for i,l in enumerate(t.splitlines()) if re.match(r'^#{1,6} ', l)]" | head -40`
Expected: a clean TOC with no duplicated headers.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: dedupe README and point UnRAID section at checked-in templates"
```

**Notes for the implementer:**
- Two logically distinct changes in one commit is acceptable here because both changes touch the same file for the same reason (cleaning up the UnRAID-related README state as part of Stage 7). If an `Edit` fails due to ambiguous matches, the most likely cause is that either Step 2 or Step 3's `old_string` overlaps unexpectedly — read the current file state and narrow the matches.
- **Do not** delete the top-level `## Docker deployment` section — that's for local development and still accurate. Only the UnRAID subsections get replaced.
- **Do not** delete the `## Getting a token` section — it's the canonical place for token setup documentation and is referenced from `unraid/README.md`.
- The orphan token paragraph at line 158 is genuinely redundant with `## Getting a token`; removing it is a strict improvement.

---

## Task 7: Merge `refactor/rebuild-plan` to trigger publish on `main`

**Files:** None (git operation).

- [ ] **Step 1: Confirm there's a green run on `refactor/rebuild-plan`**

Run: `gh run list --branch refactor/rebuild-plan --limit 1`
Expected: `completed  success  CI  refactor/rebuild-plan`

If not green, go back to Task 2 and fix.

- [ ] **Step 2: Ask Dan before pushing to main**

This is a user-visible / multi-environment action. Pause and confirm with Dan:

> "Stage 7 is ready to merge to main. This will trigger a CI run on main and republish both images with the `latest` tag. Go ahead?"

Wait for explicit approval.

- [ ] **Step 3: Fast-forward merge to main**

```bash
git checkout main
git pull
git merge --ff-only refactor/rebuild-plan
git push origin main
```

- [ ] **Step 4: Watch the main branch workflow**

Run: `gh run watch $(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: both jobs succeed. Images on GHCR now reflect main.

- [ ] **Step 5: Switch back to the feature branch for the remaining stages**

```bash
git checkout refactor/rebuild-plan
```

**Notes for the implementer:**
- **Do not** `git push --force` anything. The merge is fast-forward only.
- Stage 8 still lives on `refactor/rebuild-plan`, so return to it after the merge lands.

---

## Task 8: First real archive run on UnRAID

**Files:** None (user-driven verification on Dan's UnRAID box).

This task is executed **by Dan**, not by an implementation subagent. The implementer's job is to:
1. Confirm Tasks 1-7 are complete and images are published.
2. Print a clear handoff message with the list of manual steps Dan needs to run.
3. Wait for Dan to report back with a success or failure.
4. If failure, debug based on Dan's logs; if success, proceed to Task 9.

- [ ] **Step 1: Present handoff to Dan**

Output a message like:

> "Stage 7 tasks 1-7 are done. Both images are on GHCR:
> - `ghcr.io/danrlavoie/slack-archive-web:latest`
> - `ghcr.io/danrlavoie/slack-archive-archiver:latest`
>
> Next is the first real run on UnRAID. Steps:
>
> 1. On your UnRAID box: `mkdir -p /mnt/user/appdata/slack-archive/{data,backups,config}`
> 2. Place your Slack token: `echo 'xoxp-...' > /mnt/user/appdata/slack-archive/config/.token && chmod 600 /mnt/user/appdata/slack-archive/config/.token`
> 3. Copy the XML templates from this repo to `/boot/config/plugins/dockerMan/templates-user/` (you can scp from this laptop or pull the repo on the UnRAID box).
> 4. In the UnRAID web UI: Docker → Add Container → User templates → slack-archive-archiver → Apply. Wait for the first archive run to complete.
> 5. Docker → Add Container → User templates → slack-archive-web → Apply.
> 6. Open `http://<unraid-ip>:3100/` and confirm channels and messages render.
> 7. Report back: success or failure (and logs)."

- [ ] **Step 2: Wait for Dan's response**

Do not proceed to Task 9 until Dan confirms the first run succeeded.

- [ ] **Step 3: If Dan reports failure**

Debug based on what Dan shares:
- **Pull failure:** likely package visibility — remind Dan to make both GHCR packages public if he hasn't.
- **Token auth failure:** check the `.token` file contents and permissions, or the `SLACK_TOKEN` env var on the archiver template.
- **Archive runs but web shows empty:** path mismatch — the archiver writes to a different location than the web container reads from. Check both templates' `/app/slack-archive/data` targets match.
- **Container loop-restarts:** missing `--restart=no` in archiver template's ExtraParams.

Fix the root cause in whichever file it lives in, commit, push, and ask Dan to re-pull and re-test.

**Notes for the implementer:**
- This task can take anywhere from 10 minutes to a day depending on Dan's availability. Do not let it block Task 9 if Dan goes AFK — resume when he reports back.
- If a code fix is needed, it loops back through the GHA pipeline (commit → push → CI rebuilds images → Dan pulls the new `latest`). This is normal; document the fix in the commit message so Stage 7's completion record is coherent.

---

## Task 9: Mark Stage 7 complete in `docs/rebuild-plan.md`

**Files:**
- Modify: `docs/rebuild-plan.md`

- [ ] **Step 1: Update the Stage 7 header**

Use `Edit` to change:

```
### Stage 7 — UnRAID deployment
```

to:

```
### Stage 7 — UnRAID deployment  *(COMPLETE — 2026-04-XX)*
```

Use today's actual date in YYYY-MM-DD format.

- [ ] **Step 2: Commit**

```bash
git add docs/rebuild-plan.md
git commit -m "docs: mark Stage 7 complete in rebuild plan"
```

- [ ] **Step 3: Push**

```bash
git push origin refactor/rebuild-plan
```

**Notes for the implementer:**
- This is the terminal task for Stage 7. After this commit, announce Stage 7 complete and offer to start Stage 8 (retire the legacy stack).
- The 2-week backup rotation monitoring mentioned in the rebuild plan's exit criterion is **not** part of Stage 7's completion per Dan's decision. Dan will follow up separately if rotation misbehaves.

---

## Review checklist (run after all tasks complete)

- [ ] GHA workflow runs green on both `refactor/rebuild-plan` and `main` pushes.
- [ ] Both images exist on GHCR with `latest` tags.
- [ ] `unraid/slack-archive-web.xml` and `unraid/slack-archive-archiver.xml` parse as valid XML.
- [ ] `unraid/README.md` has no broken links and the directory layout matches the templates' bind mount paths.
- [ ] Root `README.md` UnRAID subsection points at `unraid/README.md` and does not duplicate its content.
- [ ] Dan reports the first real archive run succeeded and the web UI renders his data.
- [ ] `docs/rebuild-plan.md` marks Stage 7 complete with today's date.
- [ ] Final commit is pushed to `refactor/rebuild-plan`.
