import ora from "ora";
import {
  getToken,
  selectChannelTypes,
  selectChannels,
  shouldMergeFiles,
} from "./utils/prompt";
import {
  downloadChannels,
  downloadEachChannel,
  downloadEmojiList,
  getAuthTest,
} from "./slack";
import { createSearchIndex } from "./search";
import { createBackup, deleteBackup, deleteOlderBackups } from "./utils/backup";
import { writeLastSuccessfulArchiveDate, writeAndMerge } from "./data/write";
import { getLastSuccessfulRun, getSlackArchiveData } from "./data/read";
import { logger } from "./utils/logger";
import {
  AUTOMATIC_MODE,
  CHANNELS_DATA_PATH,
  DATA_DIR,
  EMOJIS_DATA_PATH,
  NO_SLACK_CONNECT,
  USERS_DATA_PATH,
} from "./config";
import { getUsers } from "./utils/data-load";
import { AuthTestResponse } from "@slack/web-api";

export async function main() {
  const lastSuccessfulArchive = await getLastSuccessfulRun();
  logger.info(`Welcome to slack-archive. ${lastSuccessfulArchive}`);

  if (AUTOMATIC_MODE) {
    logger.info(
      "Running in automatic mode. No user interaction will be required."
    );
  }
  if (NO_SLACK_CONNECT) {
    logger.info(
      "Running in no Slack connect mode. No data will be downloaded from Slack."
    );
  }

  try {
    // Get authentication token for downloading stuff
    logger.debug("Getting Slack token");
    const token = await getToken();

    // Create a backup of the existing data directory
    const backupDir = `${DATA_DIR}_backup_${Date.now()}`;
    await createBackup(backupDir);

    // Load existing data
    const channelsAndAuth = await getSlackArchiveData();
    const users = await getUsers();

    // Test authentication results
    const authTestResult = await getAuthTest(token);
    if (!authTestResult) {
      logger.error(
        "Authentication failed. Deleting backup and exiting process."
      );
      await deleteBackup(backupDir);
      process.exit(-1);
    }
    if (typeof authTestResult !== "boolean") {
      // AuthTestResult could be the boolean "true" if we are in NO_SLACK_CONNECT mode
      channelsAndAuth.auth = authTestResult as AuthTestResponse;
    }

    // Select what channels to download
    const channelTypes = await selectChannelTypes();
    const channels = await downloadChannels(
      { types: channelTypes.join(",") },
      users
    );
    const selectedChannels = await selectChannels(
      channels,
      channelsAndAuth.channels
    );

    // Download and save emoji mappings to a file
    const emojis = await downloadEmojiList();

    const allChannelData = await downloadEachChannel();
    const { users: finishedUsers } = allChannelData;

    // Handle data merging
    const shouldMerge = await shouldMergeFiles();
    if (shouldMerge) {
      await writeAndMerge(EMOJIS_DATA_PATH, emojis);
      await writeAndMerge(CHANNELS_DATA_PATH, selectedChannels);
      await writeAndMerge(USERS_DATA_PATH, finishedUsers);
    }

    // Download channel data
    // for (const channel of selectedChannels) {
    //   if (!channel.id) {
    //     logger.warn(`Skipping channel with no ID`, { channel });
    //     continue;
    //   }

    //   logger.info(`Processing channel ${channel.name || channel.id}`);
    //   const spinner = ora(`Downloading ${channel.name || channel.id}`).start();

    //   // Download messages and related content
    //   const { messages, newCount } = await downloadMessages(channel);
    //   await downloadFiles(channel.id, messages);
    //   await downloadEmojis(messages);

    //   // Update archive data
    //   archiveData.channels[channel.id].messages = messages.length;
    //   archiveData.channels[channel.id].lastUpdate = new Date().toISOString();

    //   spinner.succeed(`Downloaded ${newCount} new messages for ${channel.name || channel.id}`);
    //   logger.info(`Completed channel ${channel.name || channel.id}`, {
    //     messageCount: messages.length,
    //     newMessages: newCount
    //   });
    // }

    // Create search index
    const spinner = ora("Building search index").start();
    await createSearchIndex();
    spinner.succeed("Search index created");

    // Cleanup and save final state
    await deleteBackup(backupDir);
    await deleteOlderBackups();
    await writeLastSuccessfulArchiveDate();

    logger.info("Archive process complete");
  } catch (error) {
    logger.error("Archive process failed", { error });
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error("Exiting due to error", { error });
    process.exit(1);
  });
}
