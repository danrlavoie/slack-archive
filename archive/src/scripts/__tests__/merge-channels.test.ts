import { describe, test, expect } from "vitest";
import { mergeChannelMessages } from "../merge-channels.js";

describe("mergeChannelMessages", () => {
  test("combines messages from both sources, deduplicating by ts", () => {
    const legacy = [
      { ts: "1000.000", text: "old only", type: "message" },
      { ts: "2000.000", text: "overlap", type: "message" },
    ];
    const newer = [
      { ts: "2000.000", text: "overlap", type: "message" },
      { ts: "3000.000", text: "new only", type: "message" },
    ];

    const result = mergeChannelMessages(legacy, newer);

    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((m) => m.ts)).toEqual([
      "1000.000",
      "2000.000",
      "3000.000",
    ]);
    expect(result.stats.legacyOnly).toBe(1);
    expect(result.stats.newOnly).toBe(1);
    expect(result.stats.overlap).toBe(1);
    expect(result.stats.conflicts).toBe(0);
  });

  test("prefers new copy on ts collision and logs field-level diff", () => {
    const legacy = [
      { ts: "2000.000", text: "original text", type: "message", user: "U1" },
    ];
    const newer = [
      {
        ts: "2000.000",
        text: "edited text",
        type: "message",
        user: "U1",
        edited: { user: "U1", ts: "2500.000" },
      },
    ];

    const result = mergeChannelMessages(legacy, newer, "C_TEST");

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe("edited text");
    expect(result.stats.conflicts).toBe(1);
    expect(result.conflicts[0]).toEqual({
      channelId: "C_TEST",
      ts: "2000.000",
      diffs: [
        { field: "text", legacy: "original text", new: "edited text" },
        { field: "edited", legacy: undefined, new: { user: "U1", ts: "2500.000" } },
      ],
    });
  });

  test("does not flag conflict when overlapping messages are identical", () => {
    const msg = { ts: "2000.000", text: "same", type: "message", user: "U1" };
    const result = mergeChannelMessages([{ ...msg }], [{ ...msg }]);

    expect(result.stats.overlap).toBe(1);
    expect(result.stats.conflicts).toBe(0);
    expect(result.conflicts).toEqual([]);
  });

  test("sorts output by ts ascending (oldest first)", () => {
    const legacy = [{ ts: "5000.000", text: "e", type: "message" }];
    const newer = [
      { ts: "1000.000", text: "a", type: "message" },
      { ts: "3000.000", text: "c", type: "message" },
    ];

    const result = mergeChannelMessages(legacy, newer);

    expect(result.messages.map((m) => m.ts)).toEqual([
      "1000.000",
      "3000.000",
      "5000.000",
    ]);
  });

  test("handles empty inputs gracefully", () => {
    expect(mergeChannelMessages([], []).messages).toEqual([]);
    expect(mergeChannelMessages([{ ts: "1.0", type: "message" }], []).messages).toHaveLength(1);
    expect(mergeChannelMessages([], [{ ts: "1.0", type: "message" }]).messages).toHaveLength(1);
  });
});
