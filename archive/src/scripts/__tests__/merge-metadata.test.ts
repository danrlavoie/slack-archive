import { describe, test, expect } from "vitest";
import { mergeChannelsJson, mergeObjectJson, mergeSlackArchiveJson } from "../merge-metadata.js";

describe("mergeChannelsJson", () => {
  test("deduplicates channels by id, preferring new", () => {
    const legacy = [
      { id: "C1", name: "general", num_members: 5 },
      { id: "C2", name: "random", num_members: 3 },
    ];
    const newer = [
      { id: "C1", name: "general", num_members: 8 },
      { id: "C3", name: "new-channel", num_members: 2 },
    ];

    const result = mergeChannelsJson(legacy as any, newer as any);

    expect(result).toHaveLength(3);
    const c1 = result.find((c) => c.id === "C1");
    expect((c1 as any).num_members).toBe(8); // new wins
    expect(result.map((c) => c.id).sort()).toEqual(["C1", "C2", "C3"]);
  });

  test("handles empty inputs", () => {
    expect(mergeChannelsJson([], [])).toEqual([]);
    expect(mergeChannelsJson([{ id: "C1" } as any], [])).toHaveLength(1);
    expect(mergeChannelsJson([], [{ id: "C1" } as any])).toHaveLength(1);
  });
});

describe("mergeObjectJson", () => {
  test("merges two objects, new wins on conflict", () => {
    const legacy = { U1: { name: "Alice" }, U2: { name: "Bob" } };
    const newer = { U1: { name: "Alice Updated" }, U3: { name: "Charlie" } };

    const result = mergeObjectJson(legacy, newer);

    expect(Object.keys(result).sort()).toEqual(["U1", "U2", "U3"]);
    expect(result.U1).toEqual({ name: "Alice Updated" });
    expect(result.U2).toEqual({ name: "Bob" });
  });

  test("handles empty inputs", () => {
    expect(mergeObjectJson({}, {})).toEqual({});
    expect(mergeObjectJson({ a: 1 }, {})).toEqual({ a: 1 });
    expect(mergeObjectJson({}, { b: 2 })).toEqual({ b: 2 });
  });
});

describe("mergeSlackArchiveJson", () => {
  test("merges channel records and applies actual message counts", () => {
    const legacy = {
      channels: {
        C1: { messages: 100 },
        C2: { messages: 50, fullyDownloaded: true },
      },
    };
    const newer = {
      channels: {
        C1: { messages: 20 },
        C3: { messages: 5 },
      },
      auth: { user_id: "U1" },
    };
    const actualCounts = { C1: 110, C2: 50, C3: 5 };

    const result = mergeSlackArchiveJson(legacy, newer, actualCounts);

    expect(result.channels.C1.messages).toBe(110);
    expect(result.channels.C2.messages).toBe(50);
    expect(result.channels.C2.fullyDownloaded).toBe(true);
    expect(result.channels.C3.messages).toBe(5);
    expect(result.auth).toEqual({ user_id: "U1" });
  });

  test("handles empty channel records", () => {
    const result = mergeSlackArchiveJson(
      { channels: {} },
      { channels: {} },
      {},
    );
    expect(result.channels).toEqual({});
  });
});
