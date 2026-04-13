#!/bin/bash

# DEPRECATED: This script targets the legacy slack-archive output path
# and is retained only until Stage 8 of the rebuild (see docs/rebuild-plan.md).
# New deployments should use `pnpm --filter @slack-archive/archiver start -- --snapshot`
# which handles snapshotting and rotation inside the archiver itself.

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
