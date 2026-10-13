import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { resetBacksterosGoLeaderForTests } from "./backsterosRailMode";
import { handleListKeyboardNavEvent, useListKeyboardNavStore } from "./listKeyboardNavStore";

afterEach(() => {
  resetBacksterosGoLeaderForTests();
  useListKeyboardNavStore.setState({
    registrations: new Map(),
    activeZone: "sidepanel",
  });
  vi.unstubAllGlobals();
});

function keyEvent(key: string): KeyboardEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    target: null,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe("handleListKeyboardNavEvent scroll", () => {
  it("scrolls the highlighted row into view on j/k", () => {
    const scrollIntoView = vi.fn();
    const row = {
      scrollIntoView,
      parentElement: null,
    };
    vi.stubGlobal("document", {
      querySelector: vi.fn((selector: string) => (selector.includes("project-2") ? row : null)),
      querySelectorAll: vi.fn(() => []),
      activeElement: null,
    });

    let selectedId: string | null = "project-1";
    useListKeyboardNavStore.getState().register({
      zone: "sidepanel",
      getItemIds: () => ["project-1", "project-2", "project-3"],
      getSelectedId: () => selectedId,
      onActivate: (id) => {
        selectedId = id;
      },
    });

    expect(handleListKeyboardNavEvent(keyEvent("j"))).toBe(true);
    expect(selectedId).toBe("project-2");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  it("scrolls even when already on the last row", () => {
    const scrollIntoView = vi.fn();
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => ({
        scrollIntoView,
        parentElement: null,
      })),
      querySelectorAll: vi.fn(() => []),
      activeElement: null,
    });

    useListKeyboardNavStore.getState().register({
      zone: "sidepanel",
      getItemIds: () => ["a", "b"],
      getSelectedId: () => "b",
      onActivate: vi.fn(),
    });

    expect(handleListKeyboardNavEvent(keyEvent("j"))).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });
});
