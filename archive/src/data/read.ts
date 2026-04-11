import fs from "fs-extra";

import { DATE_FILE, SLACK_ARCHIVE_DATA_PATH } from "../config.js";
import { SlackArchiveData } from "../interfaces.js";
import { readJSON } from "../utils/data-load.js";
import { isValid, parseISO } from "date-fns";

/**
 * Reads the last successful run date from a file.
 * If the file does not exist or contains an invalid date, it returns an empty string.
 * If the date is valid, it returns a formatted string with the date.
 * @returns {Promise<string>} A promise that resolves to a string with the last successful run date or an empty string.
 */
export async function getLastSuccessfulRun() {
  if (!fs.existsSync(DATE_FILE)) {
    return "";
  }

  const lastSuccessfulArchive = await fs.readFile(DATE_FILE, "utf-8");

  let date = null;

  try {
    date = parseISO(lastSuccessfulArchive);
  } catch (error) {
    return "";
  }

  if (date && isValid(date)) {
    return `Last successful run: ${date.toLocaleString()}`;
  }

  return "";
}

/**
 * Reads data about existing Slack channels and authentication from a JSON file.
 * If the file does not exist, it will return an object with an empty channels property.
 * If the file exists, the returned result will be an object with whatever channels and auth
 * data were in the file - creating an empty channels object if none were found.
 * @returns {Promise<SlackArchiveData>} A promise that resolves to an object containing channels and auth data.
 */
export async function getSlackArchiveData(): Promise<SlackArchiveData> {
  const returnIfEmpty: SlackArchiveData = { channels: {} };

  if (!fs.existsSync(SLACK_ARCHIVE_DATA_PATH)) {
    return returnIfEmpty;
  }

  const result = await readJSON<SlackArchiveData>(SLACK_ARCHIVE_DATA_PATH);
  const merged = { channels: result.channels || {}, auth: result.auth };

  return merged;
}