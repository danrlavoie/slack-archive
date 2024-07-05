#!/bin/sh

# make sure you:
# have node and npm up-to-date
# have run yarn install and yarn prepublishOnly
if [[ -z $SLACK_TOKEN ]]; then
  exit "No Slack auth token found in env. Quitting"
fi

repo_dirname=$(dirname $(readlink -f "$0"))
cd $repo_dirname
npx slack-archive --automatic
# Remove old copy of the website
rm -rf /var/www/slack-archive
# Stage new copy of the website
cp -a $repo_dirname/slack-archive/. /var/www/slack-archive/
cd -
