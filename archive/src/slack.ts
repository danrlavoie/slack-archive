import {
  AuthTestResponse
  ConversationsListArguments,
  ConversationsListResponse,
  WebClient,
} from "@slack/web-api";
import ora, { Ora } from "ora";
import { config, EMOJIS_DIR, getAvatarFilePath, getChannelDataFilePath, getChannelUploadFilePath, NO_FILE_DOWNLOAD, NO_SLACK_CONNECT, USERS_DATA_PATH } from "./config.js";
import { ArchiveMessage, Channel, Emojis, File, Message, SlackArchiveData, User, Users } from "./interfaces.js";
import path from "path";
import fetch from "node-fetch";
import fs from "fs-extra";
import { logger } from "./utils/logger.js";
import { uniqBy } from "lodash-es";
import { ConversationsHistoryResponse } from "@slack/web-api";
import { getMessages, getUsers } from "./utils/data-load.js";
import { getChannels } from "../../src/data-load.js";

let _webClient: WebClient;

/**
 * Gets the current Slack web client and tests authentication.
 * @param {string} token - The API authentication token for use with the Slack API.
 * @returns {Promise<AuthTestResponse>} The result of an authentication test with Slack.
 */
export async function authTest(token: string): Promise<AuthTestResponse> {
  return getWebClient(token).auth.test();
}

/**
 * Tests the authentication with Slack using the provided token.
 * A side effect of this function is that, if the slack web client is not already initialized,
 * it will initialize it with the provided token.
 * If NO_SLACK_CONNECT is set to true, it will skip any web client activity and return true.
 * @param {string} token - The API authentication token for use with the Slack API. Unnecessary when NO_SLACK_CONNECT is set to true.
 * @returns {Promise<AuthTestResponse | boolean>} A promise that resolves to the authentication test response, true if NO_SLACK_CONNECT is set, or false if authentication fails.
 */
export async function getAuthTest(token?: string): Promise<AuthTestResponse | boolean> {
  if (NO_SLACK_CONNECT) {
    // Skip connecting and allow it to proceed
    return true;
  }

  const spinner = ora("Testing authentication with Slack...").start();
  const result = await authTest(token || 'Token should exist if we got here');

  if (!result.ok) {
    spinner.fail(`Authentication with Slack failed.`);

    logger.warn(
      `Authentication with Slack failed. The error was: ${result.error}`,
    );
    logger.warn(
      `The provided token was ${config.token}. Double-check the token and try again.`,
    );
    logger.warn(
      `For more information on the error code, see the error table at https://api.slack.com/methods/auth.test`,
    );
    return false;
  } else {
    spinner.succeed(`Successfully authorized with Slack as ${result.user}\n`);
  }

  return result;
}

/**
 * Checks if the input is a valid Slack channels response.
 * This is used to determine if the response from the Slack API contains channels data.
 * It checks if the input has a 'channels' property, which is expected in a valid response.
 * @param input - The input to check, typically the response from the Slack API.
 * @returns {boolean} - Returns true if the input is a valid channels response, false otherwise.
 */
function isChannels(input: any): input is ConversationsListResponse {
  return !!input.channels;
}

/**
 * Downloads channels (conversations) from Slack using the provided options.
 * By default, the only option used is a config of the types of channels to download.
 * It steps through pages of channels to download, and downloads user info if necessary for building the channel data (i.e. for a DM)
 * @param options - The options for the conversations.list API call, which can include types of channels to download (e.g., public, private, direct messages).
 * @param users - An object containing user data which may have already been downloaded in the past.
 * @returns {Promise<Array<Channel>>} - A promise that resolves to an array of channels downloaded from Slack.
 * If NO_SLACK_CONNECT is set to true, it will return an empty array without making any API calls.
 */
export async function downloadChannels(
  options: ConversationsListArguments,
  users: Users,
): Promise<Array<Channel>> {
  const channels: Array<Channel> = [];

  if (NO_SLACK_CONNECT) {
    return channels;
  }

  const spinner = ora("Downloading channels").start();

  for await (const page of getWebClient().paginate(
    "conversations.list",
    options as Record<string, unknown>, // Typescript gonna Typescript
  )) {
    if (isChannels(page)) {
      spinner.text = `Found ${page.channels?.length} channels (found so far: ${channels.length + (page.channels?.length || 0)
        })`;

      const pageChannels = (page.channels || []).filter((c) => !!c.id);

      for (const channel of pageChannels) {
        if (channel.is_im) {
          const user = await downloadUser(channel, users);
          channel.name =
            channel.name || `${getName(user?.id, users)} (${user?.name})`;
        }

        if (channel.is_mpim) {
          channel.name = channel.purpose?.value;
        }
      }

      channels.push(...pageChannels);
    }
  }

  spinner.succeed(`Found ${channels.length} channels`);

  return channels;
}

/**
 * Creates a WebClient instance for interacting with the Slack API.
 * If a WebClient instance already exists, it returns the existing instance.
 * @param token The API authentication token for use with the Slack API. This is only necessary the first time this function is called in the process.
 * @returns A WebClient instance configured with the provided token.
 */
export function getWebClient(token?: string) {
  if (_webClient) return _webClient;

  return (_webClient = new WebClient(token));
}


// We'll redownload users every run, but only once per user
// To keep track, we'll keep the ids in this array
export const usersRefetchedThisRun: Array<string> = [];
export const avatarsRefetchedThisRun: Array<string> = [];

/**
 * Given a message, or some other property that might have a user, and a users object,
 * returns a user data object for the user associated with that message.
 * The users parameter is used as a lookup cache. The process will always try to download the user data
 * from Slack once, but if the user has already been downloaded in this run, it will return the cached version.
 * @param item The message or object that contains a user ID.
 * @param users Data structure containing user information, keyed by user ID.
 * @returns {Promise<User | null>} A promise that resolves to the user object if found, or null if no user is associated with the item.
 * If the user is 'U00', it will return an empty object as a placeholder.
 * Null will also be returned if the user does not exist or cannot be downloaded.
 */
export async function downloadUser(
  item: Message | any,
  users: Users,
): Promise<User | null> {
  if (!item.user) return null;

  // If we already have this user *and* downloaded them before,
  // return cached version
  if (users[item.user] && usersRefetchedThisRun.includes(item.user))
    return users[item.user];

  const spinner = ora(`Downloading info for user ${item.user}...`).start();
  const user = (item.user === 'U00') ? {} as User : (
    await getWebClient().users.info({
      user: item.user,
    })
  ).user;

  if (user) {
    usersRefetchedThisRun.push(item.user);
    spinner.succeed(`Downloaded info for user ${item.user} (${user.name})`);
    return (users[item.user] = user); // TODO: Sus to mutate the users when returning a value
  }

  return null;
}

export function getName(userId: string | undefined, users: Users) {
  if (!userId) return "Unknown";
  const user = users[userId];
  if (!user) return userId;

  return user.profile?.display_name || user.profile?.real_name || user.name;
}

export function getEmojiAlias(name: string): string {
  // Ugh regex methods - this should turn "alias:hi-bob" into "hi-bob"
  const alias = [...name.matchAll(/alias:(.*)/g)][0][1]!;
  return alias!;
}

export function getEmojiFilePath(name: string, extension?: string) {
  // If we have an extension, return the correct path
  if (extension) {
    return path.join(EMOJIS_DIR, `${name}${extension}`);
  }

  // If we don't have an extension, return the first path that exists
  // regardless of extension
  const extensions = [".png", ".jpg", ".gif"];
  for (const ext of extensions) {
    if (fs.existsSync(path.join(EMOJIS_DIR, `${name}${ext}`))) {
      return path.join(EMOJIS_DIR, `${name}${ext}`);
    }
  }
}

/**
 * Downloads the list of emojis from Slack.
 * If NO_SLACK_CONNECT is set to true, it will return an empty object without making any API calls.
 * @returns An object containing the unicode emoji mappings.
 */
export async function downloadEmojiList(): Promise<Emojis> {
  if (NO_SLACK_CONNECT) {
    return {};
  }

  const response = await getWebClient().emoji.list();

  if (response.ok) {
    return response.emoji!;
  } else {
    return {};
  }
}

export async function downloadEmoji(
  name: string,
  url: string,
  emojis: Emojis,
): Promise<void> {
  // Alias?
  if (url.startsWith("alias:")) {
    const alias = getEmojiAlias(url);

    if (!emojis[alias]) {
      console.warn(
        `Found emoji alias ${alias}, which does not exist in master emoji list`,
      );
      return;
    } else {
      return downloadEmoji(alias, emojis[alias], emojis);
    }
  }

  const extension = path.extname(url);
  const filePath = getEmojiFilePath(name, extension);

  return downloadURL(url, filePath!);
}

export async function downloadEmojis(
  messages: Array<ArchiveMessage>,
  emojis: Emojis,
) {
  const regex = /:[^:\s]*(?:::[^:\s]*)*:/g;

  const spinner = ora(
    `Scanning 0/${messages.length} messages for emoji shortcodes...`,
  ).start();
  let downloaded = 0;

  for (const [i, message] of messages.entries()) {
    spinner.text = `Scanning ${i}/${messages.length} messages for emoji shortcodes...`;

    // Reactions
    if (message.reactions && message.reactions.length > 0) {
      for (const reaction of message.reactions) {
        const reactEmoji = emojis[reaction.name!];
        if (reactEmoji) {
          downloaded++;
          await downloadEmoji(reaction.name!, reactEmoji, emojis);
        }
      }
    }
  }

  spinner.succeed(
    `Scanned ${messages.length} messages for emoji (and downloaded ${downloaded})`,
  );
}


export interface DownloadUrlOptions {
  authorize?: boolean;
  force?: boolean;
}

export async function downloadURL(
  url: string,
  filePath: string,
  options: DownloadUrlOptions = {},
) {
  const authorize = options.authorize === undefined ? true : options.authorize;

  if (!options.force && fs.existsSync(filePath)) {
    return;
  }

  const { token } = config;
  const headers: HeadersInit = authorize
    ? {
      Authorization: `Bearer ${token}`,
    }
    : {};

  try {
    const response = await fetch(url, { headers });
    const buffer = await response.buffer();
    fs.outputFileSync(filePath, buffer);
  } catch (error) {
    console.warn(`Failed to download file ${url}`, error);
  }
}

export interface DownloadEachChannelParams {
  slackArchiveData: SlackArchiveData;
  selectedChannels: Array<Channel>;
  users: Users;
  emojis: Emojis;
}

export async function downloadEachChannel({
  slackArchiveData,
  selectedChannels,
  users,
  emojis,
}: DownloadEachChannelParams) {
  if (NO_SLACK_CONNECT) return;

  for (const [i, channel] of selectedChannels.entries()) {
    if (!channel.id) {
      console.warn(`Selected channel does not have an id`, channel);
      continue;
    }

    // Do we already have everything?
    slackArchiveData.channels[channel.id] =
      slackArchiveData.channels[channel.id] || {};
    if (slackArchiveData.channels[channel.id].fullyDownloaded) {
      continue;
    }

    // Download messages & users
    let downloadData = await downloadMessages(
      channel,
      i,
      selectedChannels.length,
    );
    let result = downloadData.messages;
    await downloadExtras(channel, result, users);
    await downloadEmojis(result, emojis);
    await downloadAvatars();

    // Sort messages
    const spinner = ora(
      `Saving message data for ${channel.name || channel.id} to disk`,
    ).start();
    spinner.render();

    result = uniqBy(result, "ts");
    result = result.sort((a, b) => {
      return parseFloat(b.ts || "0") - parseFloat(a.ts || "0");
    });

    fs.outputFileSync(
      getChannelDataFilePath(channel.id),
      JSON.stringify(result, undefined, 2),
    );

    // Download files. This needs to run after the messages are saved to disk
    // since it uses the message data to find which files to download.
    await downloadFilesForChannel(channel.id!, spinner);

    // Update the data load cache
    messagesCache[channel.id!] = result;

    // Update the data
    const { is_archived, is_im, is_user_deleted } = channel;
    if (is_archived || (is_im && is_user_deleted)) {
      slackArchiveData.channels[channel.id].fullyDownloaded = true;
    }
    slackArchiveData.channels[channel.id].messages = result.length;

    spinner.succeed(`Saved message data for ${channel.name || channel.id}`);
  }
}


function isConversation(input: any): input is ConversationsHistoryResponse {
  return !!input.messages;
}

function isThread(message: Message) {
  return message.reply_count && message.reply_count > 0;
}


interface DownloadMessagesResult {
  messages: Array<ArchiveMessage>;
  new: number;
}

export async function downloadMessages(
  channel: Channel,
  i: number,
  channelCount: number,
): Promise<DownloadMessagesResult> {
  let result: DownloadMessagesResult = {
    messages: [],
    new: 0,
  };

  if (!channel.id) {
    console.warn(`Channel without id`, channel);
    return result;
  }

  for (const message of await getMessages(channel.id)) {
    result.messages.push(message);
  }

  const oldest =
    result.messages.length > 0 ? parseInt(result.messages[0].ts || "0", 10) : 0;
  const name =
    channel.name || channel.id || channel.purpose?.value || "Unknown channel";

  const spinner = ora(
    `Downloading messages for channel ${i + 1}/${channelCount} (${name})...`,
  ).start();

  for await (const page of getWebClient().paginate("conversations.history", {
    channel: channel.id,
    oldest,
  })) {
    if (isConversation(page)) {
      const pageLength = page.messages?.length || 0;
      const fetched = `Fetched ${pageLength} messages`;
      const total = `(total so far: ${result.messages.length + pageLength}`;

      spinner.text = `Downloading ${i + 1
        }/${channelCount} ${name}: ${fetched} ${total})`;

      result.new = result.new + (page.messages || []).length;

      result.messages.unshift(...(page.messages || []));
    }
  }

  spinner.succeed(
    `Downloaded messages for channel ${i + 1}/${channelCount} (${name})`,
  );

  return result;
}


export async function downloadExtras(
  channel: Channel,
  messages: Array<ArchiveMessage>,
  users: Users,
) {
  const spinner = ora(
    `Downloading threads and users for ${channel.name || channel.id}...`,
  ).start();

  // Then, all messages and threads
  let processedThreads = 0;
  const totalThreads = messages.filter(isThread).length;
  for (const message of messages) {
    // Download threads
    if (isThread(message)) {
      processedThreads++;
      spinner.text = `Downloading threads (${processedThreads}/${totalThreads}) for ${channel.name || channel.id
        }...`;
      message.replies = await downloadReplies(channel, message);
    }

    // Download users and avatars
    if (message.user) {
      await downloadUser(message, users);
    }
  }

  spinner.succeed(
    `Downloaded ${totalThreads} threads and users for ${channel.name || channel.id
    }.`,
  );
}


export async function downloadReplies(
  channel: Channel,
  message: ArchiveMessage,
): Promise<Array<Message>> {
  if (!channel.id || !message.ts) {
    logger.warn("Could not find channel or message id", channel, message);
    return [];
  }

  if (!message.reply_count) {
    logger.warn("Message has no reply count", message);
    return [];
  }

  // Do we already have all replies?
  if (message.replies && message.replies.length >= message.reply_count) {
    return message.replies;
  }

  const replies = message.replies || [];
  // Oldest is the last entry
  const oldest = replies.length > 0 ? replies[replies.length - 1].ts : "0";
  const result = await getWebClient().conversations.replies({
    channel: channel.id,
    ts: message.ts,
    oldest,
  });

  // First message is the parent
  return (result.messages || []).slice(1);
}


export async function downloadAvatars() {
  const users = await getUsers();
  const userIds = Object.keys(users);
  const spinner = ora(`Downloading avatars (0/${userIds.length})`).start();

  for (const [i, userId] of userIds.entries()) {
    spinner.text = `Downloading avatars (${i + 1}/${userIds.length})`;
    await downloadAvatarForUser(users[userId]);
  }

  spinner.stop();
}

export async function downloadAvatarForUser(user?: User | null) {
  if (!user || !user.id || avatarsRefetchedThisRun.includes(user.id)) {
    return;
  }

  const { profile } = user;

  if (!profile || !profile.image_512) {
    return;
  }

  try {
    const filePath = getAvatarFilePath(
      user.id!,
      path.extname(profile.image_512),
    );
    await downloadURL(profile.image_512, filePath, {
      authorize: false,
      force: true,
    });
    avatarsRefetchedThisRun.push(user.id!);
  } catch (error) {
    logger.warn(`Failed to download avatar for user ${user.id!}`, error);
  }
}


export async function downloadFilesForChannel(channelId: string, spinner: Ora) {
  if (NO_FILE_DOWNLOAD) {
    return;
  }

  const messages = await getMessages(channelId);
  const channels = await getChannels();
  const channel = channels.find(({ id }) => id === channelId);
  const fileMessages = messages.filter(
    (m) => (m.files?.length || m.replies?.length || 0) > 0,
  );
  const getSpinnerText = (i: number, ri?: number) => {
    let reply = "";
    if (ri !== undefined) {
      reply = ` (reply ${ri})`;
    }

    return `Downloading ${i}/${
      fileMessages.length
    }${reply} messages with files for channel ${channel?.name || channelId}...`;
  };

  spinner.text = getSpinnerText(0);

  for (const [i, fileMessage] of fileMessages.entries()) {
    if (!fileMessage.files && !fileMessage.replies) {
      continue;
    }

    if (fileMessage.files) {
      for (const file of fileMessage.files) {
        spinner.text = getSpinnerText(i);
        spinner.render();
        await downloadFile(file, channelId, i, fileMessages.length, spinner);
      }
    }

    if (fileMessage.replies) {
      for (const [ri, reply] of fileMessage.replies.entries()) {
        if (reply.files) {
          for (const file of reply.files) {
            spinner.text = getSpinnerText(i, ri);
            spinner.render();
            await downloadFile(
              file,
              channelId,
              i,
              fileMessages.length,
              spinner,
            );
          }
        }
      }
    }
  }
}


async function downloadFile(
  file: File,
  channelId: string,
  i: number,
  total: number,
  spinner: Ora,
) {
  const { url_private, id, is_external, mimetype } = file;
  const { thumb_1024, thumb_720, thumb_480, thumb_pdf } = file as any;

  const fileUrl = is_external
    ? thumb_1024 || thumb_720 || thumb_480 || thumb_pdf
    : url_private;

  if (!fileUrl) return;

  spinner.text = `Downloading ${i}/${total}: ${fileUrl}`;

  const extension = path.extname(fileUrl);
  const filePath = getChannelUploadFilePath(channelId, `${id}${extension}`);

  await downloadURL(fileUrl, filePath);

  if (mimetype === "application/pdf" && thumb_pdf) {
    spinner.text = `Downloading ${i}/${total}: ${thumb_pdf}`;
    const thumbFile = filePath.replace(extension, ".png");
    await downloadURL(thumb_pdf, thumbFile);
  }
}