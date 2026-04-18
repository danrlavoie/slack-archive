import { afterEach, beforeEach, describe, test, expect } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { runMerge } from "../merge-legacy.js";

let scratch: string;

beforeEach(async () => {
  scratch = path.join(
    os.tmpdir(),
    `merge-legacy-test-${crypto.randomBytes(8).toString("hex")}`,
  );
  await fs.ensureDir(scratch);
});

afterEach(async () => {
  await fs.remove(scratch);
});

/**
 * Helper to set up a minimal legacy archive layout:
 *   <root>/data/C1.json, channels.json, users.json, emojis.json, slack-archive.json
 *   <root>/html/files/C1/F1.png
 *   <root>/html/avatars/U1.png
 *   <root>/html/emojis/smile.png
 */
async function seedLegacy(root: string) {
  const dataDir = path.join(root, "data");
  const htmlDir = path.join(root, "html");

  await fs.outputJson(path.join(dataDir, "C1.json"), [
    { ts: "1000.000", text: "legacy only", type: "message", user: "U1" },
    { ts: "2000.000", text: "overlap msg", type: "message", user: "U1" },
  ]);
  await fs.outputJson(path.join(dataDir, "channels.json"), [
    { id: "C1", name: "general" },
  ]);
  await fs.outputJson(path.join(dataDir, "users.json"), {
    U1: { id: "U1", name: "alice" },
  });
  await fs.outputJson(path.join(dataDir, "emojis.json"), {
    smile: "https://emoji.slack-edge.com/smile.png",
  });
  await fs.outputJson(path.join(dataDir, "slack-archive.json"), {
    channels: { C1: { messages: 2 } },
  });

  await fs.ensureDir(path.join(htmlDir, "files", "C1"));
  await fs.writeFile(path.join(htmlDir, "files", "C1", "F1.png"), "legacy-file");
  await fs.ensureDir(path.join(htmlDir, "avatars"));
  await fs.writeFile(path.join(htmlDir, "avatars", "U1.png"), "legacy-avatar");
  await fs.ensureDir(path.join(htmlDir, "emojis"));
  await fs.writeFile(path.join(htmlDir, "emojis", "smile.png"), "legacy-emoji");
}

/**
 * Helper to set up a minimal new archive layout:
 *   <root>/C1.json, C2.json, channels.json, users.json, emojis.json, slack-archive.json
 *   <root>/files/C2/F2.png
 *   <root>/avatars/U1.png
 *   <root>/emojis/wave.gif
 */
async function seedNew(root: string) {
  await fs.outputJson(path.join(root, "C1.json"), [
    { ts: "2000.000", text: "overlap msg", type: "message", user: "U1" },
    { ts: "3000.000", text: "new only", type: "message", user: "U1" },
  ]);
  await fs.outputJson(path.join(root, "C2.json"), [
    { ts: "4000.000", text: "new channel msg", type: "message", user: "U2" },
  ]);
  await fs.outputJson(path.join(root, "channels.json"), [
    { id: "C1", name: "general", num_members: 10 },
    { id: "C2", name: "new-channel", num_members: 2 },
  ]);
  await fs.outputJson(path.join(root, "users.json"), {
    U1: { id: "U1", name: "alice-updated" },
    U2: { id: "U2", name: "bob" },
  });
  await fs.outputJson(path.join(root, "emojis.json"), {
    smile: "https://emoji.slack-edge.com/smile-v2.png",
    wave: "https://emoji.slack-edge.com/wave.gif",
  });
  await fs.outputJson(path.join(root, "slack-archive.json"), {
    channels: { C1: { messages: 2 }, C2: { messages: 1 } },
    auth: { user_id: "U1" },
  });

  await fs.ensureDir(path.join(root, "files", "C2"));
  await fs.writeFile(path.join(root, "files", "C2", "F2.png"), "new-file");
  await fs.ensureDir(path.join(root, "avatars"));
  await fs.writeFile(path.join(root, "avatars", "U1.png"), "new-avatar");
  await fs.ensureDir(path.join(root, "emojis"));
  await fs.writeFile(path.join(root, "emojis", "wave.gif"), "new-emoji");
}

describe("runMerge", () => {
  test("produces a complete merged archive from legacy + new sources", async () => {
    const legacyRoot = path.join(scratch, "legacy");
    const newDataDir = path.join(scratch, "new");
    const outputDir = path.join(scratch, "output");

    await seedLegacy(legacyRoot);
    await seedNew(newDataDir);

    const summary = await runMerge(legacyRoot, newDataDir, outputDir);

    // --- Channel messages ---
    const dataDir = path.join(outputDir, "data");
    const c1 = await fs.readJson(path.join(dataDir, "C1.json"));
    expect(c1).toHaveLength(3);
    expect(c1.map((m: any) => m.ts)).toEqual(["1000.000", "2000.000", "3000.000"]);

    const c2 = await fs.readJson(path.join(dataDir, "C2.json"));
    expect(c2).toHaveLength(1);

    // --- Metadata ---
    const channels = await fs.readJson(path.join(dataDir, "channels.json"));
    expect(channels).toHaveLength(2);
    const c1Meta = channels.find((c: any) => c.id === "C1");
    expect(c1Meta.num_members).toBe(10); // new wins

    const users = await fs.readJson(path.join(dataDir, "users.json"));
    expect(users.U1.name).toBe("alice-updated"); // new wins
    expect(users.U2.name).toBe("bob");

    const emojis = await fs.readJson(path.join(dataDir, "emojis.json"));
    expect(emojis.smile).toContain("v2"); // new wins
    expect(emojis.wave).toBeDefined();

    const archive = await fs.readJson(path.join(dataDir, "slack-archive.json"));
    expect(archive.channels.C1.messages).toBe(3); // actual merged count
    expect(archive.channels.C2.messages).toBe(1);
    expect(archive.auth).toEqual({ user_id: "U1" });

    // --- Static assets ---
    expect(await fs.readFile(path.join(dataDir, "files", "C1", "F1.png"), "utf8")).toBe("legacy-file");
    expect(await fs.readFile(path.join(dataDir, "files", "C2", "F2.png"), "utf8")).toBe("new-file");
    expect(await fs.readFile(path.join(dataDir, "avatars", "U1.png"), "utf8")).toBe("new-avatar");
    expect(await fs.readFile(path.join(dataDir, "emojis", "smile.png"), "utf8")).toBe("legacy-emoji");
    expect(await fs.readFile(path.join(dataDir, "emojis", "wave.gif"), "utf8")).toBe("new-emoji");

    // --- Summary ---
    expect(summary.totalMessages).toBe(4);
    expect(summary.totalChannels).toBe(2);
  });

  test("rejects when output directory already exists", async () => {
    const legacyRoot = path.join(scratch, "legacy");
    const newDataDir = path.join(scratch, "new");
    const outputDir = path.join(scratch, "output");

    await seedLegacy(legacyRoot);
    await seedNew(newDataDir);
    await fs.ensureDir(outputDir); // pre-create

    await expect(runMerge(legacyRoot, newDataDir, outputDir)).rejects.toThrow(
      /already exists/,
    );
  });

  test("rejects when legacy directory does not exist", async () => {
    const newDataDir = path.join(scratch, "new");
    const outputDir = path.join(scratch, "output");

    await seedNew(newDataDir);

    await expect(
      runMerge(path.join(scratch, "nonexistent"), newDataDir, outputDir),
    ).rejects.toThrow();
  });
});
