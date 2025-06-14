import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../slack-archive/data');
export const STATIC_DIR = path.join(__dirname, '../../slack-archive/html');

export const CHANNELS_DATA_PATH = path.join(DATA_DIR, 'channels.json');
export const USERS_DATA_PATH = path.join(DATA_DIR, 'users.json');
export const EMOJIS_DATA_PATH = path.join(DATA_DIR, 'emoji.json');
export const SEARCH_DATA_PATH = path.join(DATA_DIR, 'search.js');

export const getChannelDataFilePath = (channelId: string): string => {
  return path.join(DATA_DIR, `${channelId}.json`);
};