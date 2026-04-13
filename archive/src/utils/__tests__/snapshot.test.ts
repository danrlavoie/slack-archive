import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createSnapshot, rotateSnapshots } from "../snapshot.js";

let scratch: string;

beforeEach(async () => {
  scratch = path.join(
    os.tmpdir(),
    `slack-archive-snapshot-test-${crypto.randomBytes(8).toString("hex")}`,
  );
  await fs.ensureDir(scratch);
});

afterEach(async () => {
  await fs.remove(scratch);
});

describe("createSnapshot", () => {
  test("copies dataDir into backupsDir/YYYY-MM-DD", async () => {
    const dataDir = path.join(scratch, "data");
    const backupsDir = path.join(scratch, "backups");
    await fs.ensureDir(dataDir);
    await fs.writeFile(path.join(dataDir, "foo.json"), '{"hi":1}');
    await fs.ensureDir(path.join(dataDir, "files", "C123"));
    await fs.writeFile(path.join(dataDir, "files", "C123", "a.txt"), "hello");

    await createSnapshot(dataDir, backupsDir, new Date("2026-04-12T10:00:00Z"));

    const target = path.join(backupsDir, "2026-04-12");
    expect(await fs.pathExists(target)).toBe(true);
    expect(await fs.readFile(path.join(target, "foo.json"), "utf8")).toBe('{"hi":1}');
    expect(
      await fs.readFile(path.join(target, "files", "C123", "a.txt"), "utf8"),
    ).toBe("hello");
  });

  test("overwrites an existing same-day snapshot (no merge)", async () => {
    const dataDir = path.join(scratch, "data");
    const backupsDir = path.join(scratch, "backups");
    await fs.ensureDir(dataDir);
    await fs.writeFile(path.join(dataDir, "new.json"), "new");

    // Pre-seed a stale snapshot with a file that should NOT survive.
    const staleTarget = path.join(backupsDir, "2026-04-12");
    await fs.ensureDir(staleTarget);
    await fs.writeFile(path.join(staleTarget, "old.json"), "old");

    await createSnapshot(dataDir, backupsDir, new Date("2026-04-12T10:00:00Z"));

    expect(await fs.pathExists(path.join(staleTarget, "new.json"))).toBe(true);
    expect(await fs.pathExists(path.join(staleTarget, "old.json"))).toBe(false);
  });
});

describe("rotateSnapshots", () => {
  test("keeps the N most recent dated directories, deletes the rest", async () => {
    const backupsDir = path.join(scratch, "backups");
    const dates = [
      "2026-04-06",
      "2026-04-07",
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
      "2026-04-11",
      "2026-04-12",
    ];
    for (const d of dates) {
      await fs.ensureDir(path.join(backupsDir, d));
    }

    await rotateSnapshots(backupsDir, 5);

    const remaining = (await fs.readdir(backupsDir)).sort();
    expect(remaining).toEqual([
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
      "2026-04-11",
      "2026-04-12",
    ]);
  });
});
