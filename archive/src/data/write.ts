import fs from "fs-extra";
import { differenceBy } from "lodash-es";

import { retry } from "../utils/backup";
import { DATE_FILE } from "../config";
import { logger } from "../utils/logger";

export async function write(filePath: string, data: any) {
  await retry({ name: `Writing ${filePath}` }, () => {
    fs.outputFileSync(filePath, data);
  });
}

/**
 * Writes data to a file, merging it with existing data if the file already exists.
 * If the file contains an array, it will merge the new data into the existing array,
 * ensuring no duplicates based on the `id` property.
 * If the file contains an object, it will merge the new data into the existing object.
 * Any existing data will be preserved unless it conflicts with the new data.
 * If asked to write data that is not an array or object, it will log an error.
 * @param filePath 
 * @param newData 
 */
export async function writeAndMerge(filePath: string, newData: any) {
  await retry({ name: `Writing ${filePath}` }, () => {
    let dataToWrite = newData;

    if (fs.existsSync(filePath)) {
      const oldData = fs.readJSONSync(filePath);

      if (Array.isArray(oldData)) {
        if (newData && newData[0] && newData[0].id) {
          // Take the old data, exclude aything that is in the new data,
          // and then add the new data
          dataToWrite = [
            ...differenceBy(oldData, newData, (v: any) => v.id),
            ...newData,
          ];
        } else {
          dataToWrite = [...oldData, ...newData];
        }
      } else if (typeof newData === "object") {
        dataToWrite = { ...oldData, ...newData };
      } else {
        logger.error(`writeAndMerge: Did not understand type of data`, {
          filePath,
          newData,
        });
      }
    }

    fs.outputFileSync(filePath, JSON.stringify(dataToWrite, undefined, 2));
  });
}

/**
 * Writes the current date to a file indicating the last successful archive date.
 * This is used to track when the last successful archive operation was performed.
 */
export async function writeLastSuccessfulArchiveDate() {
  const now = new Date();
  write(DATE_FILE, now.toISOString());
}