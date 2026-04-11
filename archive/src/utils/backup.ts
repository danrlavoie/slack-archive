import trash from "trash";
import { AUTOMATIC_MODE, DATA_DIR, NO_BACKUP, OUT_DIR } from "../config.js";
import fs from "fs-extra";
import { rimraf } from "rimraf";
import path from "path";
import { confirm } from "@inquirer/prompts";
import { logger } from "./logger.js";

export interface RetryOptions {
    retries: number;
    name?: string;
}

const defaultOptions: RetryOptions = {
    retries: 3,
};

/**
 * Utility function to retry an operation a specified number of times
 * with a delay between attempts. If the operation fails, it will
 * log a warning and retry after a delay, up to the specified number
 * of retries. If all attempts fail, it will throw the last error.
 * @param options {Partial<RetryOptions>} Options for the retry mechanism, i.e. name of operation
 * @param operation A JS function to be executed. If it throws an error, it will be retried.
 * @param attempt count of the current attempt, starts at 0.
 * @returns {Promise<T>} A promise that resolves to the result of the operation if successful.
 * @throws {Error} Throws the last error if all retry attempts fail.
 */
export async function retry<T>(
    options: Partial<RetryOptions>,
    operation: () => T,
    attempt = 0,
): Promise<T> {
    let mergedOptions = { ...defaultOptions, ...options };

    try {
        return operation();
    } catch (error) {
        if (attempt >= mergedOptions.retries) {
            throw error;
        }

        const ms = 250 + attempt * 250;

        if (mergedOptions.name) {
            logger.warn(`Operation "${options.name}" failed, retrying in ${ms}ms`);
        }

        await wait(ms);

        return retry(options, operation, attempt + 1);
    }
}

/**
 * Helper function to wait for a specified number of milliseconds.
 * This is used to introduce a delay between retries in the retry function.
 * @param ms {number} The number of milliseconds to wait. Defaults to 250ms.
 * @returns {Promise<void>} A promise that resolves after the specified delay through setTimeout.
 */
function wait(ms = 250) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Creates a backup of the current data directory by copying its contents
 * to a specified backup directory. If the data directory does not exist
 * or is empty, no backup is created. If the NO_BACKUP flag is set, no
 * backup will be created regardless of the data directory's state.
 * @param backupDir Path to the backup directory where the data will be copied.
 * @returns {Promise<void>} Promise that resolves when the backup is created or skipped.
 */
export async function createBackup(backupDir: string) {
    logger.debug('Creating backup');
    if (NO_BACKUP) {
        logger.info("Skipping backup creation due to NO_BACKUP flag.");
        return;
    }
    if (!fs.existsSync(DATA_DIR)) {
        logger.info("No data directory found. Skipping backup creation.");
        return;
    }

    const hasFiles = fs.readdirSync(DATA_DIR);

    if (hasFiles.length === 0) {
        logger.info("Data directory is empty. Skipping backup creation.");
        return;
    }

    logger.info(`Existing data directory found. Creating backup: ${backupDir}`);

    await fs.copy(DATA_DIR, backupDir);

    logger.info(`Backup created.`);
}

/**
 * Deletes a backup directory if it exists. If the directory does not exist,
 * the function will return without doing anything. If the TRASH_HARDER
 * environment variable is set, it will delete the directory permanently.
  * Otherwise, it will attempt to move the directory to the system's trash.
 * @param backupDir Path to the backup directory to be deleted.
 * If the directory does not exist, the function will return without doing anything.
 * @returns {Promise<void>} Promise that resolves when the backup is deleted or skipped.
 */
export async function deleteBackup(backupDir: string) {
    if (!fs.existsSync(backupDir)) {
        return;
    }

    logger.info(
        `Cleaning up backup: If anything went wrong, you'll find it in your system's trash.`,
    );

    try {
        // NB: trash doesn't work on many Linux distros
        await trash(backupDir);
        return;
    } catch (error) {
        logger.error("Moving backup to trash failed.", { error });
    }

    if (!process.env["TRASH_HARDER"]) {
        logger.info(`Set TRASH_HARDER=1 to delete files permanently.`);
        return;
    }

    try {
        await rimraf(backupDir);
    } catch (error) {
        logger.error(`Deleting backup permanently failed. Aborting here.`, { error });
    }
}

/**
 * Deletes older backups found in the OUT_DIR directory.
 * It checks for directories that start with "data_backup_" and prompts the user
 * to confirm deletion. If the AUTOMATIC_MODE flag is set, it will skip the deletion
 * and log a message instead.
 * If the user confirms, it will delete the directories.
 * @returns {Promise<void>} Promise that resolves when older backups are deleted or skipped.
 */
export async function deleteOlderBackups() {
    try {
        const oldBackupNames: Array<string> = [];
        const oldBackupPaths: Array<string> = [];

        for (const entry of fs.readdirSync(OUT_DIR)) {
            const isBackup = entry.startsWith("data_backup_");
            if (!isBackup) continue;

            const dir = path.join(OUT_DIR, entry);
            if (!fs.statSync(dir).isDirectory()) continue;

            oldBackupPaths.push(dir);
            oldBackupNames.push(entry);
        }

        if (oldBackupPaths.length === 0) return;

        if (AUTOMATIC_MODE) {
            logger.info(
                `Found existing older backups, but in automatic mode: Proceeding without deleting them.`,
            );
            return;
        }

        const del = await confirm({
            default: true,
            message: `We've found existing backups (${oldBackupNames.join(
                ", ",
            )}). Do you want to delete them?`,
        });

        if (del) {
            oldBackupPaths.forEach((v) => fs.removeSync(v));
            logger.info(`Deleted old backups: ${oldBackupNames.join(", ")}`);
        }
    } catch (error) {
        logger.error("Error while deleting older backups", { error });
    }
}