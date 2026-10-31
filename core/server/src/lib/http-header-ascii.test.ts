/**
 * undici Headers only accept ByteString values. Non-ASCII in c.header /
 * headers.set values (e.g. an em dash) throws and surfaces as HTTP 500
 * (OS-162). Keep every static header value plain ASCII.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const serverSrc = fileURLToPath(new URL("..", import.meta.url));

const HEADER_CALL = /\b(?:c\.header|headers\.set)\s*\(/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts") && !name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Extract balanced `(...)` text starting at openParenIndex (the '('). */
function extractCallArgs(source: string, openParenIndex: number): string | null {
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let escaped = false;
  for (let i = openParenIndex; i < source.length; i++) {
    const ch = source[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return source.slice(openParenIndex + 1, i);
    }
  }
  return null;
}

/** Collect string / template-literal contents from a call's argument text. */
function stringLiteralsIn(args: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < args.length) {
    const ch = args[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      let value = "";
      let escaped = false;
      while (i < args.length) {
        const c = args[i]!;
        if (escaped) {
          value += c;
          escaped = false;
          i++;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          i++;
          continue;
        }
        if (c === quote) {
          i++;
          break;
        }
        // Skip ${...} interpolations inside templates (keep surrounding ASCII text).
        if (quote === "`" && c === "$" && args[i + 1] === "{") {
          let depth = 1;
          i += 2;
          while (i < args.length && depth > 0) {
            const inner = args[i]!;
            if (inner === "{") depth++;
            else if (inner === "}") depth--;
            i++;
          }
          continue;
        }
        value += c;
        i++;
      }
      out.push(value);
      continue;
    }
    i++;
  }
  return out;
}

function nonAsciiChars(value: string): string[] {
  return [...value].filter((c) => c.charCodeAt(0) > 127);
}

describe("HTTP header values (OS-162)", () => {
  it("keeps c.header / headers.set string values ASCII (undici ByteString)", () => {
    const violations: string[] = [];
    for (const file of walk(serverSrc)) {
      const text = readFileSync(file, "utf8");
      HEADER_CALL.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = HEADER_CALL.exec(text)) !== null) {
        const openParen = match.index + match[0].length - 1;
        const args = extractCallArgs(text, openParen);
        if (args == null) continue;
        const line = text.slice(0, match.index).split("\n").length;
        for (const lit of stringLiteralsIn(args)) {
          const bad = nonAsciiChars(lit);
          if (bad.length > 0) {
            violations.push(
              `${relative(serverSrc, file)}:${line}: non-ASCII ${bad
                .map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`)
                .join(", ")} in ${JSON.stringify(lit.slice(0, 80))}`,
            );
          }
        }
      }
    }
    assert.deepEqual(violations, []);
  });
});
