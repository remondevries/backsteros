import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  LIST_REORDER_APPEND_ATTR,
  LIST_REORDER_GROUP_ATTR,
  LIST_REORDER_ITEM_ATTR,
  groupedListPointerDropToRequest,
  insertBeforeKeyForPointerTarget,
  resolveGroupedListPointerDropTarget,
} from "./grouped-list-pointer-reorder.js";

/**
 * Minimal element tree: enough of `Element` for the module under test
 * (`closest("[attr]")`, `getAttribute`, `contains`). Installed as the global
 * `Element` so `instanceof Element` holds.
 */
class FakeElement {
  parent: FakeElement | null = null;
  readonly attrs: Map<string, string>;

  constructor(attrs: Record<string, string>, children: FakeElement[] = []) {
    this.attrs = new Map(Object.entries(attrs));
    for (const child of children) child.parent = this;
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  closest(selector: string): FakeElement | null {
    const match = /^\[([^\]]+)\]$/.exec(selector);
    if (!match) throw new Error(`unsupported selector ${selector}`);
    const attr = match[1]!;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- DOM-style walk from self
    let node: FakeElement | null = this;
    while (node) {
      if (node.attrs.has(attr)) return node;
      node = node.parent;
    }
    return null;
  }

  contains(other: FakeElement): boolean {
    let node: FakeElement | null = other;
    while (node) {
      if (node === this) return true;
      node = node.parent;
    }
    return false;
  }
}

const previousElement = globalThis.Element;
const previousDocument = globalThis.document;

function stubPointerStack(stack: FakeElement[]) {
  globalThis.Element = FakeElement as unknown as typeof Element;
  globalThis.document = {
    elementsFromPoint: () => stack,
  } as unknown as Document;
}

afterEach(() => {
  globalThis.Element = previousElement;
  globalThis.document = previousDocument;
});

describe("groupedListPointerDropToRequest", () => {
  it("maps before-item targets", () => {
    assert.deepEqual(
      groupedListPointerDropToRequest({
        itemId: "a",
        fromGroupKey: "todo",
        target: { kind: "before-item", itemId: "b", groupKey: "done" },
      }),
      {
        itemId: "a",
        fromGroupKey: "todo",
        toGroupKey: "done",
        beforeItemId: "b",
      },
    );
  });

  it("maps append-group targets", () => {
    assert.deepEqual(
      groupedListPointerDropToRequest({
        itemId: "a",
        fromGroupKey: "todo",
        target: { kind: "append-group", groupKey: "done" },
      }),
      {
        itemId: "a",
        fromGroupKey: "todo",
        toGroupKey: "done",
        beforeItemId: null,
      },
    );
  });
});

describe("insertBeforeKeyForPointerTarget", () => {
  it("uses item and append key helpers", () => {
    assert.equal(
      insertBeforeKeyForPointerTarget(
        { kind: "before-item", itemId: "b", groupKey: "todo" },
        (id) => `item:${id}`,
        (group) => `append:${group}`,
      ),
      "item:b",
    );
    assert.equal(
      insertBeforeKeyForPointerTarget(
        { kind: "append-group", groupKey: "done" },
        (id) => `item:${id}`,
        (group) => `append:${group}`,
      ),
      "append:done",
    );
  });
});

describe("resolveGroupedListPointerDropTarget", () => {
  it("resolves item and append hosts under the pointer", () => {
    const append = new FakeElement({ [LIST_REORDER_APPEND_ATTR]: "done" });
    const item = new FakeElement({
      [LIST_REORDER_ITEM_ATTR]: "b",
      [LIST_REORDER_GROUP_ATTR]: "todo",
    });

    stubPointerStack([item]);
    assert.deepEqual(resolveGroupedListPointerDropTarget(1, 1, "a"), {
      kind: "before-item",
      itemId: "b",
      groupKey: "todo",
    });

    stubPointerStack([append]);
    assert.deepEqual(resolveGroupedListPointerDropTarget(1, 1, "a"), {
      kind: "append-group",
      groupKey: "done",
    });
  });

  it("ignores the dragging item itself", () => {
    const item = new FakeElement({
      [LIST_REORDER_ITEM_ATTR]: "a",
      [LIST_REORDER_GROUP_ATTR]: "todo",
    });
    stubPointerStack([item]);
    assert.equal(resolveGroupedListPointerDropTarget(1, 1, "a"), null);
  });

  it("prefers nested child items over ancestor section items", () => {
    const child = new FakeElement({
      [LIST_REORDER_ITEM_ATTR]: "child",
      [LIST_REORDER_GROUP_ATTR]: "parent:parent",
    });
    new FakeElement(
      {
        [LIST_REORDER_ITEM_ATTR]: "parent",
        [LIST_REORDER_GROUP_ATTR]: "listing:regular",
      },
      [child],
    );
    stubPointerStack([child]);
    assert.deepEqual(resolveGroupedListPointerDropTarget(1, 1, "other"), {
      kind: "before-item",
      itemId: "child",
      groupKey: "parent:parent",
    });
  });

  it("prefers append zones nested inside item hosts", () => {
    const append = new FakeElement({
      [LIST_REORDER_APPEND_ATTR]: "parent:parent",
    });
    new FakeElement(
      {
        [LIST_REORDER_ITEM_ATTR]: "parent",
        [LIST_REORDER_GROUP_ATTR]: "listing:regular",
      },
      [append],
    );
    stubPointerStack([append]);
    assert.deepEqual(resolveGroupedListPointerDropTarget(1, 1, "other"), {
      kind: "append-group",
      groupKey: "parent:parent",
    });
  });
});
