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

See the [root README](../README.md#getting-a-token) for how to create a Slack user token if you don't have one yet.

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

`--snapshot` runs a normal archive pass and then writes a dated backup under `backups/YYYY-MM-DD/` and rotates old backups according to `archive/src/utils/backup.ts`.

## Debugging a failed run

- **View last run logs:** `docker logs slack-archive-archiver`
- **Shell into the image without running the archiver:** `docker run --rm -it --entrypoint bash ghcr.io/danrlavoie/slack-archive-archiver:latest`
- **Re-run the CLI manually with different flags:** `docker run --rm -v /mnt/user/appdata/slack-archive/data:/app/slack-archive/data -v /mnt/user/appdata/slack-archive/config:/app/slack-archive/config:ro ghcr.io/danrlavoie/slack-archive-archiver:latest --help`
