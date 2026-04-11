import { AUTOMATIC_MODE, CHANNEL_TYPES, CHANNELS_DATA_PATH, config, EXCLUDE_CHANNELS, OUT_DIR, TOKEN_FILE, USE_PREVIOUS_CHANNEL_CONFIG } from "../config.js";
import fs from "fs-extra";
import { checkbox, confirm, input } from "@inquirer/prompts";
import { logger } from "./logger.js";
import { Channel, SlackArchiveChannelData } from "../interfaces.js";

/**
 * Acquires an API token to connect to Slack.
 * If the token is already hard-coded in the config, it uses that.
 * If the token file exists, it reads the token from there.
 * If neither is available, it prompts the user to enter their Slack token.
 * @returns {Promise<string>} The Slack token as a string.
 */
export async function getToken() {

  if (config.token) {
    logger.info(`Using token ${config.token}`);
    return config.token;
  }

  if (fs.existsSync(TOKEN_FILE)) {
    const token = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
    return token;
  }

  const result = await input({
    message:
      "Please enter your Slack token (xoxp-...). See README for more details.",
  });

  return result;
}

/**
 * Prompts the user to select whether to merge existing archive files or delete them.
 * If AUTOMATIC_MODE is true, it defaults to merging.
 * If CHANNELS_DATA_PATH does not exist, it returns false.
 * @returns {Promise<boolean>} A promise that resolves to true if the user chooses to merge, false otherwise.
 */
export async function shouldMergeFiles(): Promise<boolean> {
  const defaultResponse = true;

  if (!fs.existsSync(CHANNELS_DATA_PATH)) {
    return false;
  }

  // We didn't download any data. Merge.
  if (AUTOMATIC_MODE) {
    return defaultResponse;
  }

  const shouldMerge = await confirm({
    default: defaultResponse,
    message: `We've found existing archive files. Do you want to append new data (recommended)? \n If you select "No", we'll delete the existing data.`,
  });

  if (!shouldMerge) {
    logger.info(
      "You chose not to merge existing data. Deleting old data now to clear space for incoming data."
    );
    // Good fucking luck, say bye bye to your old data
    fs.emptyDirSync(OUT_DIR);
  }

  return shouldMerge;
}

/**
 * Function to select channels to download from Slack.
 * If USE_PREVIOUS_CHANNEL_CONFIG is true, it will use previously downloaded channels.
 * If AUTOMATIC_MODE is set it will return all channels.
 * If EXCLUDE_CHANNELS is set, it will exclude those channels.
 * Otherwise, it will prompt the user to select channels.
 * @param {Array<Channel>} channels - The list of available Slack channels found by hitting the Slack API.
 * @param {Record<string, SlackArchiveChannelData>} previouslyDownloadedChannels - Previously downloaded channel data.
 * @returns {Promise<Array<Channel>>} An array of selected channels to download.
 */
export async function selectChannels(
  channels: Array<Channel>,
  previouslyDownloadedChannels: Record<string, SlackArchiveChannelData>
): Promise<Array<Channel>> {
  if (USE_PREVIOUS_CHANNEL_CONFIG) {
    const selectedChannels: Array<Channel> = channels.filter(
      (channel) => channel.id && channel.id in previouslyDownloadedChannels
    );
    const selectedChannelNames = selectedChannels.map(
      (channel) => channel.name || channel.id || "Unknown"
    );
    logger.info(
      `Downloading channels selected previously: ${selectedChannelNames}`
    );

    const previousChannelIds = Object.keys(previouslyDownloadedChannels);
    if (previousChannelIds.length != selectedChannels.length) {
      logger.warn(
        "Did not find all previously selected channel IDs", {
        expected: previousChannelIds.length,
        found: selectedChannels.length
      }
      );

      const availableChannelIds = new Set<string>(
        channels.map((channel) => channel.id || "")
      );
      const missingChannelIds = previousChannelIds.filter(
        (cId) => !availableChannelIds.has(cId)
      );

      logger.warn("Missing channels", { missingChannelIds });
    } else {
      logger.info(
        `Channel selection complete`, {
        matched: previousChannelIds.length,
        total: channels.length
      }
      );
    }

    return selectedChannels;
  }

  const choices = channels.map((channel) => ({
    name: channel.name || channel.id || "Unknown",
    value: channel,
  }));

  if (AUTOMATIC_MODE) {
    if (EXCLUDE_CHANNELS) {
      const excludeChannels = EXCLUDE_CHANNELS.split(',');
      return channels.filter((channel) => !excludeChannels.includes(channel.name || ''));
    }
    return channels;
  }

  const selectedChannels = await checkbox({
    loop: true,
    message: "Which channels do you want to download?",
    choices,
  });

  return selectedChannels;
}

/**
 * Function to decide which channel types will be downloaded from Slack.
 * If CHANNEL_TYPES is set (a comma separated string of types), it will use those.
 * If AUTOMATIC_MODE is true, it will return all channel types.
 * If USE_PREVIOUS_CHANNEL_CONFIG is true, it will return all channel types.
 * If none of the above, it will prompt the user to select channel types.
 * @returns {Promise<Array<string>>} An array of selected channel types, e.g. ["public_channel", "private_channel", "mpim", "im"].
 */
export async function selectChannelTypes(): Promise<Array<string>> {
  const choices = [
    {
      name: "Public Channels",
      value: "public_channel",
    },
    {
      name: "Private Channels",
      value: "private_channel",
    },
    {
      name: "Multi-Person Direct Message",
      value: "mpim",
    },
    {
      name: "Direct Messages",
      value: "im",
    },
  ];

  if (CHANNEL_TYPES) {
    return CHANNEL_TYPES.split(",");
  }

  if (AUTOMATIC_MODE || USE_PREVIOUS_CHANNEL_CONFIG) {
    return ["public_channel", "private_channel", "mpim", "im"];
  }

  const channelTypes = await checkbox({
    loop: true,
    message: `Which channel types do you want to download?`,
    choices,
  });

  return channelTypes;
}