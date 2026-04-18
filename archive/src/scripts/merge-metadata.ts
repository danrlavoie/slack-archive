import type { Channel } from "@slack-archive/types";

/**
 * Merge two channels.json arrays. Deduplicates by `.id`, preferring the
 * newer copy when both sources contain the same channel.
 */
export function mergeChannelsJson(
  legacy: Array<Channel>,
  newer: Array<Channel>,
): Array<Channel> {
  const byId = new Map<string, Channel>();

  for (const ch of legacy) {
    if (ch.id) byId.set(ch.id, ch);
  }
  for (const ch of newer) {
    if (ch.id) byId.set(ch.id, ch);
  }

  return [...byId.values()];
}

/**
 * Merge two Record<string, T> objects. New wins on key conflict.
 * Used for users.json and emojis.json.
 */
export function mergeObjectJson<T>(
  legacy: Record<string, T>,
  newer: Record<string, T>,
): Record<string, T> {
  return { ...legacy, ...newer };
}

/**
 * Merge two slack-archive.json objects. Merges the `channels` record
 * (new wins per channel key). The `messages` count for each channel
 * will be recalculated by the caller after the actual channel files
 * are merged.
 */
export function mergeSlackArchiveJson(
  legacy: Record<string, any>,
  newer: Record<string, any>,
  actualMessageCounts: Record<string, number>,
): Record<string, any> {
  const mergedChannels: Record<string, any> = {};

  // Merge channel entries — legacy first, then new overwrites
  const allChannelIds = new Set([
    ...Object.keys(legacy.channels || {}),
    ...Object.keys(newer.channels || {}),
  ]);

  for (const id of allChannelIds) {
    const legacyEntry = legacy.channels?.[id] || {};
    const newEntry = newer.channels?.[id] || {};
    mergedChannels[id] = { ...legacyEntry, ...newEntry };
    // Override messages count with actual merged count
    if (id in actualMessageCounts) {
      mergedChannels[id].messages = actualMessageCounts[id];
    }
  }

  return {
    ...legacy,
    ...newer,
    channels: mergedChannels,
  };
}
