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
