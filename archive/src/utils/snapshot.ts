import fs from "fs-extra";
import path from "node:path";
import { format } from "date-fns";

/**
 * Copies `dataDir` into `backupsDir/YYYY-MM-DD/`, where the date comes
 * from the caller (injected for testability). If the target dir already
 * exists (e.g. a same-day re-snapshot), it is removed first so the
 * result is an exact mirror of the current dataDir, not a merge.
 */
export async function createSnapshot(
  dataDir: string,
  backupsDir: string,
  date: Date,
): Promise<string> {
  const dateDir = format(date, "yyyy-MM-dd");
  const target = path.join(backupsDir, dateDir);

  await fs.ensureDir(backupsDir);
  await fs.remove(target);
  await fs.copy(dataDir, target);

  return target;
}

const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Deletes all but the `keep` most recent YYYY-MM-DD directories under
 * `backupsDir`. Entries that don't match the date pattern are ignored
 * entirely (never listed, never deleted). A missing backupsDir is a
 * no-op, not an error.
 */
export async function rotateSnapshots(
  backupsDir: string,
  keep: number,
): Promise<string[]> {
  if (!(await fs.pathExists(backupsDir))) {
    return [];
  }

  const entries = await fs.readdir(backupsDir);
  const dateDirs = entries
    .filter((name) => DATE_DIR_PATTERN.test(name))
    .sort()
    .reverse(); // descending: newest first

  const toDelete = dateDirs.slice(keep);
  for (const name of toDelete) {
    await fs.remove(path.join(backupsDir, name));
  }
  return toDelete;
}
