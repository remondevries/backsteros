import { describe, expect, it } from "vite-plus/test";

import { formatLocalYmd } from "./taskDueDate";
import {
  orderedBacksterosInboxTaskIds,
  orderedBacksterosProjectIds,
  orderedBacksterosTaskIds,
  resolveAdjacentListItemId,
} from "./listTraversal";

function addDaysYmd(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return formatLocalYmd(date);
}

describe("orderedBacksterosTaskIds", () => {
  it("flattens status groups in sidebar order", () => {
    const ids = orderedBacksterosTaskIds([
      { id: "done", status: "completed", title: "Done" },
      { id: "triage-b", status: "triage", title: "B" },
      { id: "progress", status: "in_progress", title: "Progress" },
      { id: "triage-a", status: "triage", title: "A" },
    ]);
    expect(ids).toEqual(["triage-a", "triage-b", "progress", "done"]);
  });
});

describe("orderedBacksterosInboxTaskIds", () => {
  it("lists attention status groups first, then Due-only tasks", () => {
    const yesterday = addDaysYmd(-1);
    const today = addDaysYmd(0);
    const later = addDaysYmd(3);
    const ids = orderedBacksterosInboxTaskIds([
      {
        id: "progress",
        status: "in_progress",
        title: "Working",
        dueDate: null,
      },
      {
        id: "late",
        status: "backlog",
        title: "Late",
        dueDate: yesterday,
        sortOrder: 1,
      },
      {
        id: "due-today",
        status: "in_progress",
        title: "Due today",
        dueDate: today,
        sortOrder: 0,
      },
      {
        id: "triage",
        status: "triage",
        title: "Triage",
        dueDate: later,
      },
    ]);
    // due-today stays under In Progress; only backlog late is in Due.
    expect(ids).toEqual(["triage", "due-today", "progress", "late"]);
  });
});

describe("orderedBacksterosProjectIds", () => {
  it("flattens status groups in sidebar order", () => {
    const ids = orderedBacksterosProjectIds([
      { id: "hold", status: "on_hold", name: "Hold" },
      { id: "active-b", status: "active", sortOrder: 2, name: "B" },
      { id: "active-a", status: "active", sortOrder: 1, name: "A" },
    ]);
    expect(ids).toEqual(["active-a", "active-b", "hold"]);
  });
});

describe("resolveAdjacentListItemId", () => {
  const ids = ["a", "b", "c"] as const;

  it("moves previous and next within the list", () => {
    expect(
      resolveAdjacentListItemId({
        itemIds: ids,
        currentItemId: "b",
        direction: "previous",
      }),
    ).toBe("a");
    expect(
      resolveAdjacentListItemId({
        itemIds: ids,
        currentItemId: "b",
        direction: "next",
      }),
    ).toBe("c");
  });

  it("stops at ends when current is in the list", () => {
    expect(
      resolveAdjacentListItemId({
        itemIds: ids,
        currentItemId: "a",
        direction: "previous",
      }),
    ).toBeNull();
    expect(
      resolveAdjacentListItemId({
        itemIds: ids,
        currentItemId: "c",
        direction: "next",
      }),
    ).toBeNull();
  });

  it("picks an end when current is missing", () => {
    expect(
      resolveAdjacentListItemId({
        itemIds: ids,
        currentItemId: "missing",
        direction: "next",
      }),
    ).toBe("a");
    expect(
      resolveAdjacentListItemId({
        itemIds: ids,
        currentItemId: null,
        direction: "previous",
      }),
    ).toBe("c");
  });
});
