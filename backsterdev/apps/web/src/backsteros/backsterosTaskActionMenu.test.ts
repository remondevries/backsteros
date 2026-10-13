import { describe, expect, it } from "vite-plus/test";

import {
  buildBacksterosTaskActionMenuItems,
  type BacksterosTaskActionMenuState,
} from "./backsterosTaskActionMenu";
import { PROVIDER_ACCENT_SWATCHES } from "../providerAccentColors";

const baseState: BacksterosTaskActionMenuState = {
  hasLinkedThread: true,
  isPinned: false,
  isSnoozed: false,
  canSnoozeNow: true,
  supportsPinning: true,
  supportsSnooze: true,
  hasWorkspacePath: true,
  currentAccentColor: PROVIDER_ACCENT_SWATCHES[0],
  snoozePresets: [{ id: "hour", label: "In 1 hour", whenLabel: "3:00 PM" }],
};

function ids(state: BacksterosTaskActionMenuState): string[] {
  return buildBacksterosTaskActionMenuItems(state).map((item) => item.id);
}

describe("buildBacksterosTaskActionMenuItems", () => {
  it("always includes color, copy, and delete", () => {
    expect(ids(baseState)).toEqual(expect.arrayContaining(["color", "copy", "delete"]));
  });

  it("disables pin/snooze/unread when no linked thread", () => {
    const items = buildBacksterosTaskActionMenuItems({
      ...baseState,
      hasLinkedThread: false,
    });
    expect(items.find((item) => item.id === "pin")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "snooze")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "mark-unread")?.disabled).toBe(true);
  });

  it("disables copy path without a workspace path", () => {
    const items = buildBacksterosTaskActionMenuItems({
      ...baseState,
      hasWorkspacePath: false,
    });
    const copy = items.find((item) => item.id === "copy");
    expect(copy?.children?.find((child) => child.id === "copy-path")?.disabled).toBe(true);
    expect(copy?.children?.find((child) => child.id === "copy-task-id")?.disabled).toBeFalsy();
  });

  it("marks the current accent in the color submenu", () => {
    const items = buildBacksterosTaskActionMenuItems(baseState);
    const color = items.find((item) => item.id === "color");
    const selected = color?.children?.find(
      (child) => child.id === `color:${PROVIDER_ACCENT_SWATCHES[0]}`,
    );
    expect(selected?.label).toMatch(/^✓ /);
    expect(selected?.swatchColor).toBe(PROVIDER_ACCENT_SWATCHES[0]);
  });
});
