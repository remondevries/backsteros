import { describe, expect, it } from "vite-plus/test";

import {
  getDisplayProjectIcon,
  isEmojiProjectIconDisplay,
  migrateLegacyProjectType,
  parseDisplayEntityIcon,
} from "./project-display-icon";

describe("project-display-icon", () => {
  it("parses octicon JSON payloads", () => {
    expect(parseDisplayEntityIcon('{"t":"i","k":"beaker","c":"#38BDF8"}')).toEqual({
      display: "beaker",
      color: "#38BDF8",
    });
  });

  it("parses emoji JSON payloads", () => {
    expect(parseDisplayEntityIcon('{"t":"e","v":"🚀"}')).toEqual({
      display: "🚀",
    });
  });

  it("defaults codebase projects to terminal", () => {
    expect(getDisplayProjectIcon(null, "codebase")).toBe("terminal");
    expect(migrateLegacyProjectType("codebase")).toBe("codebase");
  });

  it("detects emoji display tokens", () => {
    expect(isEmojiProjectIconDisplay("🚀")).toBe(true);
    expect(isEmojiProjectIconDisplay("beaker")).toBe(false);
  });
});
