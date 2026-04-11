import fs from "fs-extra";

import {
  ArchiveMessage,
  Channel,
  Emojis,
  SearchFile,
  Users,
} from "../interfaces.js";
import {
  CHANNELS_DATA_PATH,
  EMOJIS_DATA_PATH,
  getChannelDataFilePath,
  SEARCH_DATA_PATH,
  USERS_DATA_PATH,
} from "../config.js";
import { retry } from "./backup.js";

async function getFile<T>(filePath: string, returnIfEmpty: T): Promise<T> {
  if (!fs.existsSync(filePath)) {
    return returnIfEmpty;
  }

  const data: T = await readJSON(filePath);

  return data;
}

export async function getMessages(
  channelId: string,
): Promise<Array<ArchiveMessage>> {

  const filePath = getChannelDataFilePath(channelId);
  const messages = await getFile<Array<ArchiveMessage>>(filePath, []);

  return messages;
}

/**
 * Fetches any preexisting users data from the users.json file.
 * This will be a mapping of a user's ID to data like their name and profile data.
 * If the file exists, it returns the users data.
 * If the file does not exist, it returns an empty object.
 * @returns {Promise<Users>} A promise that resolves to the users data.
 */
export async function getUsers(): Promise<Users> {
  return getFile<Users>(USERS_DATA_PATH, {});
}

export async function getEmoji(): Promise<Emojis> {
  return getFile<Emojis>(EMOJIS_DATA_PATH, {});
}

export async function getChannels(): Promise<Array<Channel>> {
  return getFile<Array<Channel>>(CHANNELS_DATA_PATH, []);
}

export async function getSearchFile(): Promise<SearchFile> {
  const returnIfEmpty = { users: {}, channels: {}, messages: {}, pages: {} };

  if (!fs.existsSync(SEARCH_DATA_PATH)) {
    return returnIfEmpty;
  }

  const contents = await readFile(SEARCH_DATA_PATH, "utf8");

  // See search.ts, the file is actually JS (not JSON)
  return JSON.parse(contents.slice(21, contents.length - 1));
}

export async function readFile(filePath: string, encoding = "utf8") {
  return retry<string>({ name: `Reading ${filePath}` }, () => {
    return fs.readFileSync(filePath, encoding as BufferEncoding);
  });
}

export async function readJSON<T>(filePath: string) {
  return retry<T>({ name: `Loading JSON from ${filePath}` }, () => {
    return fs.readJSONSync(filePath);
  });
}
