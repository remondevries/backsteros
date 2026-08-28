import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isListKeyboardNavContainerVisible } from "./list-keyboard-nav-visibility.js";

type FakeEl = {
  isConnected: boolean;
  closest: (selector: string) => FakeEl | null;
  checkVisibility?: (options?: object) => boolean;
  getClientRects: () => Array<{ width: number; height: number }>;
};

function fakeVisibleContainer(
  overrides: Partial<FakeEl> & {
    hiddenAncestor?: boolean;
  } = {},
): FakeEl {
  const { hiddenAncestor = false, ...rest } = overrides;
  return {
    isConnected: true,
    closest: (selector) =>
      hiddenAncestor &&
      (selector.includes("inert") || selector.includes("data-keep-alive-hidden"))
        ? ({} as FakeEl)
        : null,
    getClientRects: () => [{ width: 100, height: 40 }],
    ...rest,
  };
}

describe("isListKeyboardNavContainerVisible", () => {
  it("rejects null and disconnected containers", () => {
    assert.equal(isListKeyboardNavContainerVisible(null), false);
    assert.equal(
      isListKeyboardNavContainerVisible(
        fakeVisibleContainer({ isConnected: false }) as unknown as Element,
      ),
      false,
    );
  });

  it("rejects inert / keep-alive-hidden ancestors even when rects are non-empty", () => {
    assert.equal(
      isListKeyboardNavContainerVisible(
        fakeVisibleContainer({ hiddenAncestor: true }) as unknown as Element,
      ),
      false,
    );
  });

  it("rejects when checkVisibility reports not visible", () => {
    assert.equal(
      isListKeyboardNavContainerVisible(
        fakeVisibleContainer({
          checkVisibility: () => false,
        }) as unknown as Element,
      ),
      false,
    );
  });

  it("accepts a connected visible container", () => {
    assert.equal(
      isListKeyboardNavContainerVisible(
        fakeVisibleContainer() as unknown as Element,
      ),
      true,
    );
  });
});
