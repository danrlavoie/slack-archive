# Export your Slack workspace as static HTML

Alright, so you want to export all your messages on Slack. You want them in a format that you
can still enjoy in 20 years. This tool will help you do that.

 * **Completely static**: The generated files are pure HTML and will still work in 50 years.
 * **Everything you care about**: This tool downloads messages, files, and avatars.
 * **Nothing you do not care about**: Choose exactly which channels and DMs to download.
 * **All types of conversations**: We'll fetch public channels, private channels, DMs, and multi-person DMs.
 * **Incremental backups**: If you already have local data, we'll extend it - no need to download existing stuff again.
 * **JSON included**: All data is also stored as JSON, so you can consume it with other tools later.
 * **No cloud, free**: Do all of this for free, without giving anyone your information.
 * **Basic search**: Offers basic search functionality.

<img width="1151" alt="Screen Shot 2021-09-09 at 6 43 55 PM" src="https://user-images.githubusercontent.com/1426799/132776566-0f75a1b4-4b9a-4b53-8a39-e44e8a747a68.png">

## Using it

1. Do you already have a user token for your workspace? If not, read on below on how to get a token.
2. Make sure you have [`node` and `npm`](https://nodejs.org/en/) installed, ideally something newer than Node v14.
3. Run `yarn install` to install dependencies
4. Run `yarn prepublishOnly` to compile the project
5. Run `npx slack-archive`, which will interactively guide you through the options.

```sh
npx slack-archive
```

### Parameters

```
--automatic:                Don't prompt and automatically fetch all messages from all channels.
--channel-types             Comma-separated list of channel types to fetch messages from.
                            (public_channel, private_channel, mpim, im)
--no-backup:                Don't create backups. Not recommended.
--no-search:                Don't create a search file, saving disk space.
--no-file-download:         Don't download files.
--no-slack-connect:         Don't connect to Slack, just generate HTML from local data.
--force-html-generation:    Force regeneration of HTML files. Useful after slack-archive upgrades.
```

## Making changes to the code

When you've updated something within /src or /static, just run `yarn prepublishOnly` again to regenerate the built app, then `npx slack-archive` to execute it.

## Getting a token

In order to download messages from private channels and direct messages, we will need a "user
token". Slack uses the token to identify what permissions it'll give this app. We used to be able
to just copy a token out of your Slack app, but now, we'll need to create a custom app and jump
through a few hoops.

This will be mostly painless, I promise.

### 1) Make a custom app

Head over to https://api.slack.com/apps and `Create New App`. Select `From scratch`.
Give it a name and choose the workspace you'd like to export.

Then, from the `Features` menu on the left, select `OAuth & Permission`. 

As a redirect URL, enter something random that doesn't actually exist, or a domain you control. For instace:

```
https://notarealurl.com/
```

(Note that redirects will take a _very_ long time if using a domain that doesn't actually exist)

Then, add the following `User Token Scopes`:

 * channels:history
 * channels:read
 * files:read
 * groups:history
 * groups:read
 * im:history
 * im:read
 * mpim:history
 * mpim:read
 * remote_files:read
 * users:read

Finally, head back to `Basic Information` and make a note of your app's `client
id` and `client secret`. We'll need both later.

### 2) Authorize

Make sure you have your Slack workspace `URL` (aka team name) and your app's `client id`.
Then, in a browser, open this URL - replacing `{your-team-name}` and `{your-client-id}`
with your values.

```
https://{your-team-name}.slack.com/oauth/authorize?client_id={your-client-id}&scope=client
```

Confirm everything until Slack sends you to the mentioned non-existent URL. Look at your
browser's address bar - it should contain an URL that looks like this:

```
https://notarealurl.com/?code={code}&state=
```

Copy everything between `?code=` and `&state`. This is your `code`. We'll need it in the
next step.

Next, we'll exchange your code for a token. To do so, we'll also need your `client secret` 
from the first step when we created your app. In a browser, open this URL - replacing 
`{your-team-name}`, `{your-client-id}`, `{your-code}` and `{your-client-secret}` with 
your values.

```
https://{your-team-name}.slack.com/api/oauth.access?client_id={your-client-id}&client_secret={your-client-secret}&code={your-code}"
```

Your browser should now be returning some JSON including a token. Make a note of it - that's what we'll use.

When you start the app, you can copy-paste that token into the prompt. You can also `export SLACK_TOKEN={token}` to set an environment variable that will be used instead.

## Automating it

Three shell scripts are provided to allow for automating the archive, backup, and cleanup in cycles.

### exec_archive.sh

This runs the archive process in automatic mode, assuming it has a SLACK_TOKEN available in the environment where it runs. Results are stored within the git repo in the /slack-archive folder.

### backup.sh

This copies the current contents of the repo's /slack-archive folder to $home/slack-archive/slack-archive-YYYY-MM-DD, a date assigned to the date the backup was run (NOT the date the archive was initiallhy taken).

### cleanup.sh

Since Slack archives, with media files included, can take up several gigabytes of storage, this removes old archives. It will only execute if it finds 8 or more backups in the backup directory, and it deletes the oldest backup from disk.

### Putting it together

Set up invocations of exec_archive.sh, backup.sh, and cleanup.sh into a crontab so you're protected in the event the Slack API breaks at some point.

Then, host your current copy of slack-archive on a webserver (i.e. with nginx) if you want to view it from a local network.

## Hosting with nginx

Since nginx runs through systemctl, you can start and restart the service with the root crontab:

```
sudo crontab -e
# in the crontab
@hourly systemctl restart nginx
```

copy archive-nginx.conf to /etc/nginx/conf.d/archive-nginx.conf and ensure the exec_archive.sh script has executed, to copy your slack archive website to /var/www/slack-archive.

Check your firewall to ensure your preferred security settings are in place, and start nginx to begin serving the website.
