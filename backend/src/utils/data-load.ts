import fs from 'fs-extra';
import path from 'path';
import {
  CHANNELS_DATA_PATH,
  EMOJIS_DATA_PATH,
  EMOJIS_DIR,
  getChannelDataFilePath,
  SEARCH_DATA_PATH,
  USERS_DATA_PATH
} from '../config.js';
import type { Message, User, Channel, SearchIndex } from '@slack-archive/types';

export const messagesCache: Record<string, Message[]> = {};

async function getFile<T>(filePath: string, returnIfEmpty: T): Promise<T> {
  if (!fs.existsSync(filePath)) {
    return returnIfEmpty;
  }
  const data = await readJSON<T>(filePath);
  return data;
}

export async function getMessages(channelId: string, cachedOk = false): Promise<Message[]> {
  if (cachedOk && messagesCache[channelId]) {
    return messagesCache[channelId];
  }
  const filePath = getChannelDataFilePath(channelId);
  messagesCache[channelId] = await getFile<Message[]>(filePath, []);
  return messagesCache[channelId];
}

export async function getUsers(): Promise<Record<string, User>> {
  return getFile(USERS_DATA_PATH, {});
}

export async function getEmoji(): Promise<Record<string, string>> {
  return getFile(EMOJIS_DATA_PATH, {});
}

export async function getChannels(): Promise<Channel[]> {
  return getFile(CHANNELS_DATA_PATH, []);
}

export async function getSearchFile(): Promise<SearchIndex> {
  if (!fs.existsSync(SEARCH_DATA_PATH)) {
    return {};
  }
  return readJSON<SearchIndex>(SEARCH_DATA_PATH);
}

export async function readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
  return fs.readFile(filePath, encoding);
}

export async function readJSON<T>(filePath: string): Promise<T> {
  return fs.readJSON(filePath);
}

export async function getEmojiFile(name: string): Promise<string | null> {
  try {
    // Try common extensions
    for (const ext of ['.png', '.gif', '.jpg']) {
      const fullPath = path.join(EMOJIS_DIR, `${name}${ext}`);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error finding emoji file ${name}:`, error);
    return null;
  }
}