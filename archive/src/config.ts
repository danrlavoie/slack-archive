import path from "path";

export const config = {
  token: process.env.SLACK_TOKEN,
};

function findCliParameter(param: string) {
  const args = process.argv;

  for (const arg of args) {
    if (arg === param) {
      return true;
    }
  }

  return false;
}

function getCliParameter(param: string) {
  const args = process.argv;

  for (const [i, arg] of args.entries()) {
    if (arg === param) {
      return args[i + 1];
    }
  }

  return null;
}

export const AUTOMATIC_MODE = findCliParameter("--automatic");
export const USE_PREVIOUS_CHANNEL_CONFIG = findCliParameter(
  "--use-previous-channel-config"
);
export const CHANNEL_TYPES = getCliParameter("--channel-types");
export const NO_BACKUP = findCliParameter("--no-backup");
export const NO_SEARCH = findCliParameter("--no-search");
export const SNAPSHOT_MODE = findCliParameter("--snapshot");
export const EXCLUDE_CHANNELS = getCliParameter("--exclude-channels");
export const BASE_DIR = process.cwd();
export const OUT_DIR = path.join(BASE_DIR, process.env.ARCHIVE_OUT_DIR || "slack-archive");
export const CONFIG_DIR = path.join(OUT_DIR, "config");
export const TOKEN_FILE = path.join(CONFIG_DIR, ".token");
export const DATE_FILE = path.join(OUT_DIR, ".last-successful-run");
export const DATA_DIR = path.join(OUT_DIR, "data");
export const FILES_DIR = path.join(DATA_DIR, "files");
export const AVATARS_DIR = path.join(DATA_DIR, "avatars");
export const EMOJIS_DIR = path.join(DATA_DIR, "emojis");
export const BACKUPS_DIR = path.join(OUT_DIR, "backups");

export const CHANNELS_DATA_PATH = path.join(DATA_DIR, "channels.json");
export const USERS_DATA_PATH = path.join(DATA_DIR, "users.json");
export const EMOJIS_DATA_PATH = path.join(DATA_DIR, "emojis.json");
export const SEARCH_FILE_PATH = path.join(DATA_DIR, "search-index.json");
export const SLACK_ARCHIVE_DATA_PATH = path.join(
  DATA_DIR,
  "slack-archive.json",
);
export const SEARCH_DATA_PATH = path.join(DATA_DIR, "search.js");

export function getChannelDataFilePath(channelId: string) {
  return path.join(DATA_DIR, `${channelId}.json`);
}

export function getChannelUploadFilePath(channelId: string, fileName: string) {
  return path.join(FILES_DIR, channelId, fileName);
}

export function getAvatarFilePath(userId: string, extension: string) {
  return path.join(AVATARS_DIR, `${userId}${extension}`);
}
