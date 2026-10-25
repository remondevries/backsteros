// @effect-diagnostics nodeBuiltinImport:off - BacksterOS bridge code runs outside the Effect runtime.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  formatOpenHrefTrigger,
  normalizeDesktopOpenHref,
  writeBacksterosDesktopOpenHref,
} from "./open-href.ts";

const HOME_PATH = path.join(os.homedir(), ".config", "backsteros", "open-href");
const TMP_PATH = "/tmp/backsteros-open-href";

let previousHome: string | null = null;
let previousTmp: string | null = null;

afterEach(() => {
  if (previousHome != null) {
    fs.writeFileSync(HOME_PATH, previousHome, "utf8");
    previousHome = null;
  } else if (fs.existsSync(HOME_PATH)) {
    // Leave whatever writeBacksterosDesktopOpenHref created; restore only if we snapshot.
  }
  if (previousTmp != null) {
    try {
      fs.writeFileSync(TMP_PATH, previousTmp, "utf8");
    } catch {
      // ignore
    }
    previousTmp = null;
  }
});

describe("normalizeDesktopOpenHref", () => {
  it("accepts absolute in-app paths only", () => {
    expect(normalizeDesktopOpenHref("/projects/PF/tasks/pf-43")).toBe("/projects/PF/tasks/pf-43");
    expect(normalizeDesktopOpenHref("  /contacts/12  ")).toBe("/contacts/12");
    expect(normalizeDesktopOpenHref("//evil")).toBeNull();
    expect(normalizeDesktopOpenHref("https://example.com")).toBeNull();
    expect(normalizeDesktopOpenHref("projects/x")).toBeNull();
  });
});

describe("writeBacksterosDesktopOpenHref", () => {
  it("writes stamp + path for the desktop open-href watcher", () => {
    try {
      previousHome = fs.readFileSync(HOME_PATH, "utf8");
    } catch {
      previousHome = "";
    }
    try {
      previousTmp = fs.readFileSync(TMP_PATH, "utf8");
    } catch {
      previousTmp = "";
    }

    const result = writeBacksterosDesktopOpenHref("/projects/BDV/tasks/bdv-61");
    expect(result.ok).toBe(true);
    expect(result.href).toBe("/projects/BDV/tasks/bdv-61");

    const written = fs.readFileSync(HOME_PATH, "utf8");
    expect(written).toMatch(/^\d+\n\/projects\/BDV\/tasks\/bdv-61\n$/);
    expect(formatOpenHrefTrigger("/projects/BDV/tasks/bdv-61", 1)).toBe(
      "1\n/projects/BDV/tasks/bdv-61\n",
    );
  });
});
