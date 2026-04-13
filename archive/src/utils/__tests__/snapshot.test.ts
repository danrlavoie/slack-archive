import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { format } from "date-fns";
import { createSnapshot, rotateSnapshots, runSnapshot } from "../snapshot.js";

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

  test("ignores entries that don't match YYYY-MM-DD", async () => {
    const backupsDir = path.join(scratch, "backups");
    await fs.ensureDir(path.join(backupsDir, "2026-04-12"));
    await fs.ensureDir(path.join(backupsDir, "2026-04-11"));
    await fs.ensureDir(path.join(backupsDir, "README.md"));
    await fs.ensureDir(path.join(backupsDir, "not-a-date"));
    await fs.writeFile(path.join(backupsDir, "stray.txt"), "hi");

    await rotateSnapshots(backupsDir, 5);

    const remaining = (await fs.readdir(backupsDir)).sort();
    expect(remaining).toEqual([
      "2026-04-11",
      "2026-04-12",
      "README.md",
      "not-a-date",
      "stray.txt",
    ]);
  });

  test("is a no-op when fewer dirs exist than keep count", async () => {
    const backupsDir = path.join(scratch, "backups");
    await fs.ensureDir(path.join(backupsDir, "2026-04-11"));
    await fs.ensureDir(path.join(backupsDir, "2026-04-12"));

    const deleted = await rotateSnapshots(backupsDir, 5);

    expect(deleted).toEqual([]);
    const remaining = (await fs.readdir(backupsDir)).sort();
    expect(remaining).toEqual(["2026-04-11", "2026-04-12"]);
  });

  test("is a no-op when backupsDir does not exist", async () => {
    const backupsDir = path.join(scratch, "does-not-exist");

    const deleted = await rotateSnapshots(backupsDir, 5);

    expect(deleted).toEqual([]);
    expect(await fs.pathExists(backupsDir)).toBe(false);
  });
});

describe("runSnapshot", () => {
  test("creates today's snapshot and rotates to keep 5", async () => {
    const dataDir = path.join(scratch, "data");
    const backupsDir = path.join(scratch, "backups");
    await fs.ensureDir(dataDir);
    await fs.writeFile(path.join(dataDir, "today.json"), "today");

    // Pre-seed 5 older snapshots; after runSnapshot there should be
    // 5 total (the 4 most recent existing + today's new one).
    const seededDates = [
      "2020-01-01",
      "2020-01-02",
      "2020-01-03",
      "2020-01-04",
      "2020-01-05",
    ];
    for (const d of seededDates) {
      await fs.ensureDir(path.join(backupsDir, d));
    }

    await runSnapshot(dataDir, backupsDir);

    const remaining = (await fs.readdir(backupsDir)).sort();
    // Today's dir is always >= 2026-04-12, so it sorts to the end
    // and the oldest seeded one (2020-01-01) gets pruned.
    expect(remaining.length).toBe(5);
    expect(remaining.includes("2020-01-01")).toBe(false);
    // Use the same local-time formatter as createSnapshot to avoid
    // a UTC-vs-local timezone off-by-one near midnight.
    const today = format(new Date(), "yyyy-MM-dd");
    expect(remaining.includes(today)).toBe(true);
    expect(
      await fs.readFile(path.join(backupsDir, today, "today.json"), "utf8"),
    ).toBe("today");
  });
});
