import fs from "fs-extra";
import path from "node:path";

export interface AssetStats {
  files: number;
  avatars: number;
  emojis: number;
}

/**
 * Count files recursively in a directory.
 */
async function countFiles(dir: string): Promise<number> {
  if (!(await fs.pathExists(dir))) return 0;
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(full);
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Copy asset directories from both sources into output.
 * Legacy is copied first, then new overwrites on conflict.
 *
 * @param legacyAssetsDir - Directory containing legacy files/, avatars/, emojis/
 * @param newAssetsDir - Directory containing new files/, avatars/, emojis/
 * @param outputDir - Output directory to write merged assets into
 */
export async function copyAssets(
  legacyAssetsDir: string,
  newAssetsDir: string,
  outputDir: string,
): Promise<AssetStats> {
  const assetDirs = ["files", "avatars", "emojis"] as const;

  for (const dir of assetDirs) {
    const legacySrc = path.join(legacyAssetsDir, dir);
    const newSrc = path.join(newAssetsDir, dir);
    const dest = path.join(outputDir, dir);

    // Copy legacy first (if exists)
    if (await fs.pathExists(legacySrc)) {
      await fs.copy(legacySrc, dest, { overwrite: false });
    }

    // Copy new second — overwrites legacy on conflict
    if (await fs.pathExists(newSrc)) {
      await fs.copy(newSrc, dest, { overwrite: true });
    }
  }

  return {
    files: await countFiles(path.join(outputDir, "files")),
    avatars: await countFiles(path.join(outputDir, "avatars")),
    emojis: await countFiles(path.join(outputDir, "emojis")),
  };
}
