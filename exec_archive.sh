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
cd -
