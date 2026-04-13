import { describe, expect, test } from "vitest";
import path from "node:path";
import { CONFIG_DIR, OUT_DIR, TOKEN_FILE } from "../../config.js";

describe("archive config paths", () => {
  test("CONFIG_DIR is a sibling of data/ under OUT_DIR", () => {
    expect(CONFIG_DIR).toBe(path.join(OUT_DIR, "config"));
  });

  test("TOKEN_FILE lives under CONFIG_DIR", () => {
    expect(TOKEN_FILE).toBe(path.join(CONFIG_DIR, ".token"));
  });
});
