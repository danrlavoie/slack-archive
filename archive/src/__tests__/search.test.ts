import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createSearchIndex } from "../search.js";

// Mock the config module so getMessageJsonFiles uses our test channels.json
vi.mock("../config.js", () => ({
  CHANNELS_DATA_PATH: "", // Will be set per test
}));

import * as config from "../config.js";

describe("createSearchIndex", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "search-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("indexes top-level messages", async () => {
    const channelId = "C123TEST";
    const messages = [
      { ts: "1000.000", type: "message", text: "hello world" },
      { ts: "2000.000", type: "message", text: "goodbye world" },
    ];

    // Write test data
    fs.writeFileSync(path.join(tmpDir, `${channelId}.json`), JSON.stringify(messages));
    fs.writeFileSync(path.join(tmpDir, "channels.json"), JSON.stringify([{ id: channelId }]));
    // Point config at our channels.json
    (config as any).CHANNELS_DATA_PATH = path.join(tmpDir, "channels.json");

    const outFile = path.join(tmpDir, "search-index.json");
    await createSearchIndex(tmpDir, outFile);

    const index = JSON.parse(fs.readFileSync(outFile, "utf8"));
    expect(index["1000.000"]).toEqual({
      text: "hello world",
      file: `${channelId}.json`,
      ts: "1000.000",
    });
    expect(index["2000.000"].text).toBe("goodbye world");
    // Top-level messages should NOT have thread_ts
    expect(index["1000.000"].thread_ts).toBeUndefined();
  });

  test("indexes thread replies with thread_ts", async () => {
    const channelId = "C456TEST";
    const messages = [
      {
        ts: "1000.000",
        type: "message",
        text: "thread parent",
        reply_count: 2,
        thread_ts: "1000.000",
        replies: [
          { ts: "1000.001", type: "message", text: "first reply", thread_ts: "1000.000" },
          { ts: "1000.002", type: "message", text: "second reply", thread_ts: "1000.000" },
        ],
      },
      { ts: "2000.000", type: "message", text: "standalone" },
    ];

    fs.writeFileSync(path.join(tmpDir, `${channelId}.json`), JSON.stringify(messages));
    fs.writeFileSync(path.join(tmpDir, "channels.json"), JSON.stringify([{ id: channelId }]));
    (config as any).CHANNELS_DATA_PATH = path.join(tmpDir, "channels.json");

    const outFile = path.join(tmpDir, "search-index.json");
    await createSearchIndex(tmpDir, outFile);

    const index = JSON.parse(fs.readFileSync(outFile, "utf8"));

    // Parent message indexed without thread_ts
    expect(index["1000.000"].text).toBe("thread parent");
    expect(index["1000.000"].thread_ts).toBeUndefined();

    // Replies indexed with thread_ts pointing to parent
    expect(index["1000.001"]).toEqual({
      text: "first reply",
      file: `${channelId}.json`,
      ts: "1000.001",
      thread_ts: "1000.000",
    });
    expect(index["1000.002"].text).toBe("second reply");
    expect(index["1000.002"].thread_ts).toBe("1000.000");

    // Standalone message — no thread_ts
    expect(index["2000.000"].thread_ts).toBeUndefined();
  });

  test("skips replies with no text content", async () => {
    const channelId = "C789TEST";
    const messages = [
      {
        ts: "1000.000",
        type: "message",
        text: "parent",
        reply_count: 1,
        replies: [
          { ts: "1000.001", type: "message" }, // no text
        ],
      },
    ];

    fs.writeFileSync(path.join(tmpDir, `${channelId}.json`), JSON.stringify(messages));
    fs.writeFileSync(path.join(tmpDir, "channels.json"), JSON.stringify([{ id: channelId }]));
    (config as any).CHANNELS_DATA_PATH = path.join(tmpDir, "channels.json");

    const outFile = path.join(tmpDir, "search-index.json");
    await createSearchIndex(tmpDir, outFile);

    const index = JSON.parse(fs.readFileSync(outFile, "utf8"));
    expect(index["1000.000"]).toBeDefined();
    expect(index["1000.001"]).toBeUndefined();
  });
});
