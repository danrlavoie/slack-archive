import fs from "fs-extra";
import path from "node:path";
import { mergeChannelMessages, type ConflictEntry, type MergeStats } from "./merge-channels.js";
import { mergeChannelsJson, mergeObjectJson, mergeSlackArchiveJson } from "./merge-metadata.js";
import { copyAssets, type AssetStats } from "./merge-assets.js";

export interface MergeSummary {
  totalMessages: number;
  totalChannels: number;
  totalConflicts: number;
  channels: Array<{ id: string; stats: MergeStats }>;
  conflicts: Array<ConflictEntry>;
  assets: AssetStats;
}

/**
 * Discover channel file IDs (C* and D* JSON files) in a directory.
 */
function discoverChannelFiles(entries: string[]): string[] {
  return entries
    .filter((f) => /^[CD][A-Z0-9]+\.json$/.test(f))
    .map((f) => f.replace(".json", ""));
}

/**
 * Run the full merge: channel messages, metadata, and static assets.
 *
 * @param legacyRoot - Legacy archive root (contains data/ and html/)
 * @param newDataDir - New archive data directory (contains JSONs and asset subdirs)
 * @param outputDir - Output archive root (will contain data/ with everything)
 */
export async function runMerge(
  legacyRoot: string,
  newDataDir: string,
  outputDir: string,
): Promise<MergeSummary> {
  // --- Validation ---
  if (await fs.pathExists(outputDir)) {
    throw new Error(`Output directory already exists: ${outputDir}`);
  }
  const legacyDataDir = path.join(legacyRoot, "data");
  if (!(await fs.pathExists(legacyDataDir))) {
    throw new Error(`Legacy data directory not found: ${legacyDataDir}`);
  }
  if (!(await fs.pathExists(newDataDir))) {
    throw new Error(`New data directory not found: ${newDataDir}`);
  }

  const outputDataDir = path.join(outputDir, "data");
  await fs.ensureDir(outputDataDir);

  // --- Discover channels ---
  const legacyEntries = await fs.readdir(legacyDataDir);
  const newEntries = await fs.readdir(newDataDir);

  const legacyChannelIds = discoverChannelFiles(legacyEntries);
  const newChannelIds = discoverChannelFiles(newEntries);
  const allChannelIds = [...new Set([...legacyChannelIds, ...newChannelIds])];

  // --- Merge channel messages ---
  const channelResults: Array<{ id: string; stats: MergeStats }> = [];
  const allConflicts: Array<ConflictEntry> = [];
  const actualMessageCounts: Record<string, number> = {};
  let totalMessages = 0;

  for (const channelId of allChannelIds) {
    const legacyFile = path.join(legacyDataDir, `${channelId}.json`);
    const newFile = path.join(newDataDir, `${channelId}.json`);

    const legacyMsgs = (await fs.pathExists(legacyFile))
      ? await fs.readJson(legacyFile)
      : [];
    const newMsgs = (await fs.pathExists(newFile))
      ? await fs.readJson(newFile)
      : [];

    const result = mergeChannelMessages(legacyMsgs, newMsgs, channelId);

    await fs.outputJson(
      path.join(outputDataDir, `${channelId}.json`),
      result.messages,
      { spaces: 2 },
    );

    channelResults.push({ id: channelId, stats: result.stats });
    allConflicts.push(...result.conflicts);
    actualMessageCounts[channelId] = result.messages.length;
    totalMessages += result.messages.length;
  }

  // --- Merge metadata ---
  const legacyChannelsJson = (await fs.pathExists(path.join(legacyDataDir, "channels.json")))
    ? await fs.readJson(path.join(legacyDataDir, "channels.json"))
    : [];
  const newChannelsJson = (await fs.pathExists(path.join(newDataDir, "channels.json")))
    ? await fs.readJson(path.join(newDataDir, "channels.json"))
    : [];
  await fs.outputJson(
    path.join(outputDataDir, "channels.json"),
    mergeChannelsJson(legacyChannelsJson, newChannelsJson),
    { spaces: 2 },
  );

  const legacyUsers = (await fs.pathExists(path.join(legacyDataDir, "users.json")))
    ? await fs.readJson(path.join(legacyDataDir, "users.json"))
    : {};
  const newUsers = (await fs.pathExists(path.join(newDataDir, "users.json")))
    ? await fs.readJson(path.join(newDataDir, "users.json"))
    : {};
  await fs.outputJson(
    path.join(outputDataDir, "users.json"),
    mergeObjectJson(legacyUsers, newUsers),
    { spaces: 2 },
  );

  const legacyEmojis = (await fs.pathExists(path.join(legacyDataDir, "emojis.json")))
    ? await fs.readJson(path.join(legacyDataDir, "emojis.json"))
    : {};
  const newEmojis = (await fs.pathExists(path.join(newDataDir, "emojis.json")))
    ? await fs.readJson(path.join(newDataDir, "emojis.json"))
    : {};
  await fs.outputJson(
    path.join(outputDataDir, "emojis.json"),
    mergeObjectJson(legacyEmojis, newEmojis),
    { spaces: 2 },
  );

  const legacyArchive = (await fs.pathExists(path.join(legacyDataDir, "slack-archive.json")))
    ? await fs.readJson(path.join(legacyDataDir, "slack-archive.json"))
    : { channels: {} };
  const newArchive = (await fs.pathExists(path.join(newDataDir, "slack-archive.json")))
    ? await fs.readJson(path.join(newDataDir, "slack-archive.json"))
    : { channels: {} };
  await fs.outputJson(
    path.join(outputDataDir, "slack-archive.json"),
    mergeSlackArchiveJson(legacyArchive, newArchive, actualMessageCounts),
    { spaces: 2 },
  );

  // --- Copy static assets ---
  // Legacy: <legacyRoot>/html/{files,avatars,emojis}
  // New: <newDataDir>/{files,avatars,emojis}
  // Output: <outputDir>/data/{files,avatars,emojis}
  const legacyAssetsDir = path.join(legacyRoot, "html");
  const assets = await copyAssets(legacyAssetsDir, newDataDir, outputDataDir);

  // --- Build summary ---
  return {
    totalMessages,
    totalChannels: allChannelIds.length,
    totalConflicts: allConflicts.length,
    channels: channelResults,
    conflicts: allConflicts,
    assets,
  };
}

function formatConflict(c: ConflictEntry): string {
  const diffs = c.diffs
    .map((d) => `  ${d.field}: ${JSON.stringify(d.legacy)} → ${JSON.stringify(d.new)}`)
    .join("\n");
  return `WARN: ${c.channelId} ts=${c.ts} differs:\n${diffs}`;
}

/**
 * CLI entry point. Parses args, runs merge, prints summary.
 */
async function main() {
  const [legacyRoot, newDataDir, outputDir] = process.argv.slice(2);

  if (!legacyRoot || !newDataDir || !outputDir) {
    console.error(
      "Usage: merge-legacy <legacy-root> <new-data-dir> <output-dir>",
    );
    console.error("");
    console.error("  legacy-root   Legacy archive root (contains data/ and html/)");
    console.error("  new-data-dir  New archive data directory (JSONs + asset subdirs)");
    console.error("  output-dir    Output archive root (must not exist)");
    process.exit(1);
  }

  console.log("Starting legacy data merge...");
  console.log(`  Legacy: ${legacyRoot}`);
  console.log(`  New:    ${newDataDir}`);
  console.log(`  Output: ${outputDir}`);
  console.log("");

  const summary = await runMerge(
    path.resolve(legacyRoot),
    path.resolve(newDataDir),
    path.resolve(outputDir),
  );

  // Print conflicts
  if (summary.conflicts.length > 0) {
    console.log(`\n--- Conflicts (${summary.totalConflicts}) ---\n`);
    for (const c of summary.conflicts) {
      console.log(formatConflict(c));
    }
  }

  // Print per-channel summary
  console.log("\n--- Per-channel summary ---\n");
  for (const ch of summary.channels) {
    const { legacyOnly, newOnly, overlap, conflicts } = ch.stats;
    const total = legacyOnly + newOnly + overlap;
    console.log(
      `${ch.id}: ${total} messages (${legacyOnly} legacy-only, ${newOnly} new-only, ${overlap} overlap, ${conflicts} conflicts)`,
    );
  }

  // Print totals
  console.log(`\nTotal: ${summary.totalMessages} messages across ${summary.totalChannels} channels, ${summary.totalConflicts} conflicts`);
  console.log(`Files: ${summary.assets.files} | Avatars: ${summary.assets.avatars} | Emojis: ${summary.assets.emojis}`);
  console.log("\nMerge complete.");
}

// ESM entry point guard
const isMainModule = process.argv[1] &&
  (await import("node:url")).fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  main().catch((err) => {
    console.error("Merge failed:", err.message);
    process.exit(1);
  });
}
