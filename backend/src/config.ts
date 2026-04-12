import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = process.env.ARCHIVE_DATA_DIR
  ? path.resolve(process.env.ARCHIVE_DATA_DIR)
  : path.join(__dirname, '../../slack-archive/data');

export const FILES_DIR = path.join(DATA_DIR, 'files');
export const EMOJIS_DIR = path.join(DATA_DIR, 'emojis');
export const AVATARS_DIR = path.join(DATA_DIR, 'avatars');

export const CHANNELS_DATA_PATH = path.join(DATA_DIR, 'channels.json');
export const USERS_DATA_PATH = path.join(DATA_DIR, 'users.json');
export const EMOJIS_DATA_PATH = path.join(DATA_DIR, 'emojis.json');
export const SEARCH_DATA_PATH = path.join(DATA_DIR, 'search-index.json');

export const getChannelDataFilePath = (channelId: string): string => {
  return path.join(DATA_DIR, `${channelId}.json`);
};