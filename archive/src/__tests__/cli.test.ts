import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock fs-extra before importing modules that use it
vi.mock("fs-extra", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readJSONSync: vi.fn(() => ({})),
    outputFileSync: vi.fn(),
  },
}));

// Mock config to avoid filesystem side effects
vi.mock("../config.js", () => ({
  DATA_DIR: "/tmp/test-data",
  BACKUPS_DIR: "/tmp/test-backups",
  CHANNELS_DATA_PATH: "/tmp/test-data/channels.json",
  EMOJIS_DATA_PATH: "/tmp/test-data/emojis.json",
  USERS_DATA_PATH: "/tmp/test-data/users.json",
  SLACK_ARCHIVE_DATA_PATH: "/tmp/test-data/slack-archive-data.json",
  SEARCH_FILE_PATH: "/tmp/test-data/search-index.json",
  AUTOMATIC_MODE: true,
  SNAPSHOT_MODE: false,
  getChannelDataFilePath: (id: string) => `/tmp/test-data/${id}.json`,
}));

import fs from "fs-extra";
import { writeChannelData } from "../data/write.js";
import type { ArchiveMessage } from "@slack-archive/types";

// We test the critical ordering: downloadExtras mutates message.replies,
// then writeChannelData persists them. This mirrors the fixed cli.ts flow.
describe("archiver write ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("replies are present in written data after downloadExtras populates them", async () => {
    // Simulate messages with thread metadata but no replies yet
    const messages: ArchiveMessage[] = [
      {
        ts: "1000.000",
        type: "message",
        text: "parent message",
        reply_count: 2,
        thread_ts: "1000.000",
      } as ArchiveMessage,
      {
        ts: "2000.000",
        type: "message",
        text: "standalone message",
      } as ArchiveMessage,
    ];

    // Simulate what downloadExtras does: mutate message.replies in place
    const mockReplies = [
      { ts: "1000.001", type: "message", text: "reply 1", thread_ts: "1000.000" },
      { ts: "1000.002", type: "message", text: "reply 2", thread_ts: "1000.000" },
    ];

    // Mutate the parent message as downloadExtras would
    messages[0].replies = mockReplies as any;

    // Now write — this is what cli.ts does after downloadExtras
    writeChannelData("C123", messages);

    // Verify fs.outputFileSync was called with data that includes replies
    expect(fs.outputFileSync).toHaveBeenCalledOnce();
    const [filePath, jsonStr] = (fs.outputFileSync as any).mock.calls[0];
    expect(filePath).toBe("/tmp/test-data/C123.json");

    const written = JSON.parse(jsonStr);
    expect(written).toHaveLength(2);

    // Parent message should have replies
    const parent = written.find((m: any) => m.ts === "1000.000");
    expect(parent.replies).toHaveLength(2);
    expect(parent.replies[0].text).toBe("reply 1");
    expect(parent.replies[1].text).toBe("reply 2");

    // Standalone message should not have replies
    const standalone = written.find((m: any) => m.ts === "2000.000");
    expect(standalone.replies).toBeUndefined();
  });
});
