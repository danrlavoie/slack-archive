import { afterEach, beforeEach, describe, test, expect } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { copyAssets } from "../merge-assets.js";

let scratch: string;

beforeEach(async () => {
  scratch = path.join(
    os.tmpdir(),
    `merge-assets-test-${crypto.randomBytes(8).toString("hex")}`,
  );
  await fs.ensureDir(scratch);
});

afterEach(async () => {
  await fs.remove(scratch);
});

describe("copyAssets", () => {
  test("copies files from both sources, new wins on conflict", async () => {
    // Set up legacy assets
    const legacyDir = path.join(scratch, "legacy");
    await fs.ensureDir(path.join(legacyDir, "files", "C1"));
    await fs.writeFile(path.join(legacyDir, "files", "C1", "F001.png"), "legacy-file");
    await fs.ensureDir(path.join(legacyDir, "avatars"));
    await fs.writeFile(path.join(legacyDir, "avatars", "U1.png"), "legacy-avatar");
    await fs.ensureDir(path.join(legacyDir, "emojis"));
    await fs.writeFile(path.join(legacyDir, "emojis", "smile.png"), "legacy-emoji");

    // Set up new assets (with one conflicting avatar)
    const newDir = path.join(scratch, "new");
    await fs.ensureDir(path.join(newDir, "files", "C2"));
    await fs.writeFile(path.join(newDir, "files", "C2", "F002.png"), "new-file");
    await fs.ensureDir(path.join(newDir, "avatars"));
    await fs.writeFile(path.join(newDir, "avatars", "U1.png"), "new-avatar");
    await fs.ensureDir(path.join(newDir, "emojis"));
    await fs.writeFile(path.join(newDir, "emojis", "wave.gif"), "new-emoji");

    const outputDir = path.join(scratch, "output");

    const stats = await copyAssets(legacyDir, newDir, outputDir);

    // Legacy file preserved
    expect(await fs.readFile(path.join(outputDir, "files", "C1", "F001.png"), "utf8")).toBe("legacy-file");
    // New file copied
    expect(await fs.readFile(path.join(outputDir, "files", "C2", "F002.png"), "utf8")).toBe("new-file");
    // Conflict: new wins
    expect(await fs.readFile(path.join(outputDir, "avatars", "U1.png"), "utf8")).toBe("new-avatar");
    // Both emojis present
    expect(await fs.readFile(path.join(outputDir, "emojis", "smile.png"), "utf8")).toBe("legacy-emoji");
    expect(await fs.readFile(path.join(outputDir, "emojis", "wave.gif"), "utf8")).toBe("new-emoji");

    expect(stats.files).toBeGreaterThanOrEqual(2);
    expect(stats.avatars).toBeGreaterThanOrEqual(1);
    expect(stats.emojis).toBeGreaterThanOrEqual(2);
  });

  test("handles missing source directories gracefully", async () => {
    const legacyDir = path.join(scratch, "empty-legacy");
    const newDir = path.join(scratch, "empty-new");
    await fs.ensureDir(legacyDir);
    await fs.ensureDir(newDir);
    const outputDir = path.join(scratch, "output");

    const stats = await copyAssets(legacyDir, newDir, outputDir);

    expect(stats.files).toBe(0);
    expect(stats.avatars).toBe(0);
    expect(stats.emojis).toBe(0);
  });
});
