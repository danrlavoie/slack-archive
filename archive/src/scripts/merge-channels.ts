import type { ArchiveMessage } from "@slack-archive/types";

export interface MergeStats {
  legacyOnly: number;
  newOnly: number;
  overlap: number;
  conflicts: number;
}

export interface ConflictEntry {
  channelId: string;
  ts: string;
  diffs: Array<{ field: string; legacy: unknown; new: unknown }>;
}

export interface MergeResult {
  messages: Array<ArchiveMessage>;
  stats: MergeStats;
  conflicts: Array<ConflictEntry>;
}

function diffMessages(
  legacy: ArchiveMessage,
  newer: ArchiveMessage,
): Array<{ field: string; legacy: unknown; new: unknown }> {
  const allKeys = new Set([...Object.keys(legacy), ...Object.keys(newer)]);
  const diffs: Array<{ field: string; legacy: unknown; new: unknown }> = [];

  for (const key of allKeys) {
    const lv = (legacy as Record<string, unknown>)[key];
    const nv = (newer as Record<string, unknown>)[key];
    if (JSON.stringify(lv) !== JSON.stringify(nv)) {
      diffs.push({ field: key, legacy: lv, new: nv });
    }
  }

  return diffs;
}

export function mergeChannelMessages(
  legacy: Array<ArchiveMessage>,
  newer: Array<ArchiveMessage>,
  channelId: string = "unknown",
): MergeResult {
  const merged = new Map<string, ArchiveMessage>();
  const legacySet = new Set<string>();
  const newSet = new Set<string>();
  const conflicts: Array<ConflictEntry> = [];

  // Insert legacy first
  for (const msg of legacy) {
    const ts = msg.ts ?? "";
    merged.set(ts, msg);
    legacySet.add(ts);
  }

  // Insert new — overwrites legacy on collision
  for (const msg of newer) {
    const ts = msg.ts ?? "";
    newSet.add(ts);

    if (merged.has(ts)) {
      // Check for diffs before overwriting
      const existing = merged.get(ts)!;
      const diffs = diffMessages(existing, msg);
      if (diffs.length > 0) {
        conflicts.push({ channelId, ts, diffs });
      }
    }

    merged.set(ts, msg);
  }

  const overlap = [...legacySet].filter((ts) => newSet.has(ts)).length;

  const messages = [...merged.values()].sort(
    (a, b) => parseFloat(a.ts ?? "0") - parseFloat(b.ts ?? "0"),
  );

  return {
    messages,
    stats: {
      legacyOnly: legacySet.size - overlap,
      newOnly: newSet.size - overlap,
      overlap,
      conflicts: conflicts.length,
    },
    conflicts,
  };
}
