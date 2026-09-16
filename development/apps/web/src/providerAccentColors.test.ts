import { describe, expect, it } from "vite-plus/test";

import {
  PROVIDER_ACCENT_SWATCHES,
  composerAccentScopeKey,
  composerAgentAccentButtonStyle,
  composerAgentAccentStyle,
  providerAccentSwatchForInstance,
  providerAccentSwatchIndex,
  resolveComposerAccentColor,
  resolveProviderAccentColor,
} from "./providerAccentColors";

describe("providerAccentColors", () => {
  it("keeps ten chromatic BacksterOS swatches without slate or gray", () => {
    expect(PROVIDER_ACCENT_SWATCHES).toEqual([
      "#38BDF8",
      "#4ADE80",
      "#FACC15",
      "#FB923C",
      "#FDBA74",
      "#F87171",
      "#b68cff",
      "#8b7cf6",
      "#5bbad5",
      "#ee7a47",
    ]);
    expect(PROVIDER_ACCENT_SWATCHES).toHaveLength(10);
    for (const swatch of PROVIDER_ACCENT_SWATCHES) {
      expect(swatch.toLowerCase()).not.toMatch(/^#(9ca3af|64748b)$/u);
      expect(swatch).toMatch(/^#[0-9A-Fa-f]{6}$/u);
    }
  });

  it("maps the same scope key to the same swatch", () => {
    const first = providerAccentSwatchForInstance("thread-a:cursor");
    const second = providerAccentSwatchForInstance("thread-a:cursor");
    expect(first).toBe(second);
    expect(PROVIDER_ACCENT_SWATCHES).toContain(first);
  });

  it("gives different chats different colors even on the same agent", () => {
    const chatA = resolveComposerAccentColor({
      threadId: "thread-aaa",
      instanceId: "cursor",
    });
    const chatB = resolveComposerAccentColor({
      threadId: "thread-bbb",
      instanceId: "cursor",
    });
    expect(chatA).not.toBe(chatB);
  });

  it("changes color when the agent changes inside a chat", () => {
    const colors = new Set(
      ["cursor", "claude", "codex", "grok", "opencode"].map((instanceId) =>
        resolveComposerAccentColor({
          threadId: "thread-aaa",
          instanceId,
        }),
      ),
    );
    expect(colors.size).toBeGreaterThan(1);
  });

  it("builds a stable chat+agent scope key", () => {
    expect(
      composerAccentScopeKey({
        threadId: "thread-1",
        instanceId: "cursor",
      }),
    ).toBe("thread-1:cursor");
    expect(
      composerAccentScopeKey({
        draftKey: "draft-1",
        instanceId: "codex",
      }),
    ).toBe("draft-1:codex");
  });

  it("spreads different scope keys across the palette", () => {
    const ids = [
      "codex",
      "claude",
      "cursor",
      "thread-1:codex",
      "thread-2:codex",
      "thread-3:claude",
      "draft-a:cursor",
      "draft-b:cursor",
    ];
    const colors = new Set(ids.map((id) => providerAccentSwatchForInstance(id)));
    expect(colors.size).toBeGreaterThan(1);
    for (const id of ids) {
      expect(providerAccentSwatchIndex(id)).toBeGreaterThanOrEqual(0);
      expect(providerAccentSwatchIndex(id)).toBeLessThan(PROVIDER_ACCENT_SWATCHES.length);
    }
  });

  it("prefers a configured accent over the stable swatch", () => {
    expect(
      resolveComposerAccentColor({
        threadId: "t1",
        instanceId: "cursor",
        accentColor: "#F87171",
      }),
    ).toBe("#F87171");
    expect(resolveProviderAccentColor("codex_work", "  #FB923C  ")).toBe("#FB923C");
  });

  it("prefers an override over the configured provider accent", () => {
    expect(
      resolveComposerAccentColor({
        threadId: "t1",
        instanceId: "cursor",
        accentColor: "#F87171",
        overrideColor: "#4ADE80",
      }),
    ).toBe("#4ADE80");
  });

  it("falls back to a stable swatch when accent is missing or invalid", () => {
    const expected = providerAccentSwatchForInstance("claude_personal");
    expect(resolveProviderAccentColor("claude_personal", undefined)).toBe(expected);
    expect(resolveProviderAccentColor("claude_personal", "")).toBe(expected);
    expect(resolveProviderAccentColor("claude_personal", "not-a-color")).toBe(expected);
  });

  it("exposes composer CSS variables for outline and send chrome", () => {
    const style = composerAgentAccentStyle("#4ADE80");
    expect(style).toMatchObject({
      "--composer-agent-accent": "#4ADE80",
      "--message-action": "#4ADE80",
      "--color-message-action": "#4ADE80",
      "--message-action-foreground": "#0a0a0a",
      "--color-message-action-foreground": "#0a0a0a",
    });
    expect(style["--message-action-hover"]).toContain("#4ADE80");
    expect(style["--color-message-action-hover"]).toContain("#4ADE80");
  });

  it("builds solid button styles that do not rely on theme tokens", () => {
    expect(composerAgentAccentButtonStyle("#4ADE80")).toEqual({
      backgroundColor: "#4ADE80",
      borderColor: "#4ADE80",
      color: "#0a0a0a",
    });
    expect(composerAgentAccentButtonStyle("#8b7cf6")).toEqual({
      backgroundColor: "#8b7cf6",
      borderColor: "#8b7cf6",
      color: "#ffffff",
    });
  });
});
