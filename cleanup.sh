#!/bin/sh

# Usage:
# ./cleanup.sh
# Because Slack archives, with their media files, can take up several gigabytes, this file rotates out old backups
# It only cleans if there are 8 or more snapshots in the backup directory
# It then removes the oldest backup in the directory

echo "This shell script is set to remove files and directories!"
echo "If you have tested it and trust its behavior, remove lines 9-11 to acknowledge the risks and run it."
exit
backup_dirname=$HOME/slack-archive-backup
count=$(ls $backup_dirname | wc -l)

if [[ $count -ge 8 ]]; then
  newest=$(ls -c | tail -n 1)
  rm -rf $backup_dirname/$newest
fi
