// Standard library imports
import { uniqBy } from "lodash-es";

// Third-party library imports
import ora from "ora";

// Internal utility imports
import { logger } from "./utils/logger.js";
import { createBackup, deleteBackup, deleteOlderBackups } from "./utils/backup.js";
import { getUsers } from "./utils/data-load.js";

// Internal config and constants
import {
  AUTOMATIC_MODE,
  CHANNELS_DATA_PATH,
  DATA_DIR,
  EMOJIS_DATA_PATH,
  SEARCH_FILE_PATH,
  USERS_DATA_PATH,
} from "./config.js";

// Internal data read/write
import {
  writeLastSuccessfulArchiveDate,
  writeAndMerge,
  writeChannelData,
} from "./data/write.js";
import { getLastSuccessfulRun, getSlackArchiveData } from "./data/read.js";

// Internal prompt utilities
import {
  getToken,
  selectChannelTypes,
  selectChannels,
  shouldMergeFiles,
} from "./utils/prompt.js";

// Slack API and download utilities
import {
  downloadAvatars,
  downloadChannels,
  downloadEmojiList,
  downloadEmojis,
  downloadExtras,
  downloadFilesForChannel,
  downloadMessages,
  getAuthTest,
} from "./slack.js";

// Search index
import { createSearchIndex } from "./search.js";

export async function main() {
  const lastSuccessfulArchive = await getLastSuccessfulRun();
  logger.info(`Welcome to slack-archive. ${lastSuccessfulArchive}`);

  if (AUTOMATIC_MODE) {
    logger.info(
      "Running in automatic mode. No user interaction will be required."
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
    channelsAndAuth.auth = authTestResult;

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

    for (const [i, channel] of selectedChannels.entries()) {
      if (!channel.id) {
        logger.warn(`Skipping channel with no ID`, { channel });
        continue;
      }
      // Do we already have everything?
      channelsAndAuth.channels[channel.id] =
        channelsAndAuth.channels[channel.id] || {};
      if (channelsAndAuth.channels[channel.id].fullyDownloaded) {
        continue;
      }
      // Download messages & users
      let downloadData = await downloadMessages(
        channel,
        i,
        selectedChannels.length
      );
      const result = downloadData.messages;
      const sortedUniqueResult = uniqBy(result, "ts").sort((a, b) => {
        return parseFloat(b.ts || "0") - parseFloat(a.ts || "0");
      });
      // Write the channel message data to disk
      writeChannelData(channel.id, sortedUniqueResult);
      const { is_archived, is_im, is_user_deleted } = channel;
      if (is_archived || (is_im && is_user_deleted)) {
        channelsAndAuth.channels[channel.id].fullyDownloaded = true;
      }
      channelsAndAuth.channels[channel.id].messages = result.length;

      // Download extra content
      await downloadExtras(channel, result, users);
      await downloadEmojis(result, emojis);
      await downloadAvatars();
      // Download files. This needs to run after the messages are saved to disk
      // since it uses the message data to find which files to download.
      await downloadFilesForChannel(channel.id);
    }

    // Handle data merging
    const shouldMerge = await shouldMergeFiles();
    if (shouldMerge) {
      await writeAndMerge(EMOJIS_DATA_PATH, emojis);
      await writeAndMerge(CHANNELS_DATA_PATH, selectedChannels);
      await writeAndMerge(USERS_DATA_PATH, users);
    }

    // Create search index
    const spinner = ora("Building search index").start();
    await createSearchIndex(DATA_DIR, SEARCH_FILE_PATH);
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

main().catch((error) => {
  logger.error("Exiting due to error", { error });
  process.exit(1);
});
