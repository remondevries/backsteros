import { describe, expect, it } from "vitest";

import { parseDotenv, serializeDotenv } from "./dotenvEntries";

describe("dotenvEntries", () => {
  it("parses keys and ignores comments", () => {
    const entries = parseDotenv(
      ["# header", "FOO=bar", "export BAZ=qux", "", "INVALID", "1BAD=x"].join("\n"),
    );
    expect(entries).toEqual([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ]);
  });

  it("round-trips quoted multiline values", () => {
    const original = [{ key: "PEM", value: "line1\nline2" }];
    const text = serializeDotenv(original);
    expect(text).toContain('PEM="line1\\nline2"');
    expect(parseDotenv(text)).toEqual(original);
  });

  it("quotes empty and spaced values", () => {
    expect(serializeDotenv([{ key: "EMPTY", value: "" }])).toBe('EMPTY=""\n');
    expect(serializeDotenv([{ key: "SPACED", value: "a b" }])).toBe('SPACED="a b"\n');
  });
});
