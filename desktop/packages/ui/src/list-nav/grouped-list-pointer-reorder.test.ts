import { describe, expect, it, vi, afterEach } from "vitest";

import {
  LIST_REORDER_APPEND_ATTR,
  LIST_REORDER_GROUP_ATTR,
  LIST_REORDER_ITEM_ATTR,
  groupedListPointerDropToRequest,
  insertBeforeKeyForPointerTarget,
  resolveGroupedListPointerDropTarget,
} from "./grouped-list-pointer-reorder.js";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("groupedListPointerDropToRequest", () => {
  it("maps before-item targets", () => {
    expect(
      groupedListPointerDropToRequest({
        itemId: "a",
        fromGroupKey: "todo",
        target: { kind: "before-item", itemId: "b", groupKey: "done" },
      }),
    ).toEqual({
      itemId: "a",
      fromGroupKey: "todo",
      toGroupKey: "done",
      beforeItemId: "b",
    });
  });

  it("maps append-group targets", () => {
    expect(
      groupedListPointerDropToRequest({
        itemId: "a",
        fromGroupKey: "todo",
        target: { kind: "append-group", groupKey: "done" },
      }),
    ).toEqual({
      itemId: "a",
      fromGroupKey: "todo",
      toGroupKey: "done",
      beforeItemId: null,
    });
  });
});

describe("insertBeforeKeyForPointerTarget", () => {
  it("uses item and append key helpers", () => {
    expect(
      insertBeforeKeyForPointerTarget(
        { kind: "before-item", itemId: "b", groupKey: "todo" },
        (id) => `item:${id}`,
        (group) => `append:${group}`,
      ),
    ).toBe("item:b");
    expect(
      insertBeforeKeyForPointerTarget(
        { kind: "append-group", groupKey: "done" },
        (id) => `item:${id}`,
        (group) => `append:${group}`,
      ),
    ).toBe("append:done");
  });
});

describe("resolveGroupedListPointerDropTarget", () => {
  it("resolves item and append hosts under the pointer", () => {
    document.body.innerHTML = `
      <div ${LIST_REORDER_APPEND_ATTR}="done" id="append"></div>
      <div ${LIST_REORDER_ITEM_ATTR}="b" ${LIST_REORDER_GROUP_ATTR}="todo" id="item"></div>
    `;
    const item = document.getElementById("item")!;
    const append = document.getElementById("append")!;

    vi.spyOn(document, "elementsFromPoint").mockReturnValue([item]);
    expect(resolveGroupedListPointerDropTarget(1, 1, "a")).toEqual({
      kind: "before-item",
      itemId: "b",
      groupKey: "todo",
    });

    vi.spyOn(document, "elementsFromPoint").mockReturnValue([append]);
    expect(resolveGroupedListPointerDropTarget(1, 1, "a")).toEqual({
      kind: "append-group",
      groupKey: "done",
    });
  });

  it("ignores the dragging item itself", () => {
    document.body.innerHTML = `
      <div ${LIST_REORDER_ITEM_ATTR}="a" ${LIST_REORDER_GROUP_ATTR}="todo" id="item"></div>
    `;
    const item = document.getElementById("item")!;
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([item]);
    expect(resolveGroupedListPointerDropTarget(1, 1, "a")).toBeNull();
  });

  it("prefers nested child items over ancestor section items", () => {
    document.body.innerHTML = `
      <div ${LIST_REORDER_ITEM_ATTR}="parent" ${LIST_REORDER_GROUP_ATTR}="listing:regular" id="section">
        <div id="child-wrap" ${LIST_REORDER_ITEM_ATTR}="child" ${LIST_REORDER_GROUP_ATTR}="parent:parent"></div>
      </div>
    `;
    const child = document.getElementById("child-wrap")!;
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([child]);
    expect(resolveGroupedListPointerDropTarget(1, 1, "other")).toEqual({
      kind: "before-item",
      itemId: "child",
      groupKey: "parent:parent",
    });
  });

  it("prefers append zones nested inside item hosts", () => {
    document.body.innerHTML = `
      <div ${LIST_REORDER_ITEM_ATTR}="parent" ${LIST_REORDER_GROUP_ATTR}="listing:regular" id="section">
        <div ${LIST_REORDER_APPEND_ATTR}="parent:parent" id="append"></div>
      </div>
    `;
    const append = document.getElementById("append")!;
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([append]);
    expect(resolveGroupedListPointerDropTarget(1, 1, "other")).toEqual({
      kind: "append-group",
      groupKey: "parent:parent",
    });
  });
});
