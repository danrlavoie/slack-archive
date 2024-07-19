#!/bin/bash

# Usage:
# ./backup.sh
# Copies the present slack-archive from the current repo into a date-specific slack-archive backup folder in the home directory

# or $BASH_SOURCE instead of $0
repo_dirname=$(dirname $(readlink -f "$0"))
date=$(date '+%Y-%m-%d')

# Only copy if it can find a slack archive to copy
if [ ! -d "$repo_dirname/slack-archive" ]; then
  exit
fi
if [[ -n $DEBUG_OUTPUT ]]; then
  echo "Making directory for $date"
fi
mkdir -p $HOME/slack-archive-backup/slack-archive-$date
cp -a $repo_dirname/slack-archive/. $_/
if [[ -n $DEBUG_OUTPUT ]]; then
  echo "Finished copying files."
fi
