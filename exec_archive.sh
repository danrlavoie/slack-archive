#!/bin/bash
# This script assumes you're setting up a node environment with nvm
# If you plan to cron it, you must have some sort of node executable in the PATH used by cron.
# Load nvm
export NVM_DIR="$HOME/.config/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
nvm use --lts

# make sure you:
# have node and npm up-to-date
# have run yarn install and yarn prepublishOnly
if [[ -z $SLACK_TOKEN ]]; then
  exit "No Slack auth token found in env. Quitting"
fi

repo_dirname=$(dirname $(readlink -f "$0"))
cd $repo_dirname
npx slack-archive --automatic
# Once, when you set up this script for the first time,
# go into /var/www and run:
# ln -s $HOME/path/to/slack-archive/slack-archive ./slack-archive
# Then you will always have your nginx host pointing at the latest archive snapshot.

cd -
