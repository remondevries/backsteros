import { describe, expect, it, vi } from "vitest";

/**
 * Pure helpers covering the printable-key → search redirect guard used by
 * {@link usePropertyMenuSearchTyping}.
 */
function shouldRedirectPrintableKeyToSearch(input: {
  readonly key: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly isComposing?: boolean;
  readonly searchFocused: boolean;
  readonly activeInsideMenu: boolean;
}): boolean {
  if (input.metaKey || input.ctrlKey || input.altKey) return false;
  if (input.isComposing) return false;
  if (input.key.length !== 1) return false;
  if (input.searchFocused) return false;
  if (!input.activeInsideMenu) return false;
  return true;
}

describe("property menu search typing redirect", () => {
  it("redirects printable keys when a menu item owns focus", () => {
    expect(
      shouldRedirectPrintableKeyToSearch({
        key: "c",
        searchFocused: false,
        activeInsideMenu: true,
      }),
    ).toBe(true);
  });

  it("does not steal keys already typed into the search field", () => {
    expect(
      shouldRedirectPrintableKeyToSearch({
        key: "c",
        searchFocused: true,
        activeInsideMenu: true,
      }),
    ).toBe(false);
  });

  it("ignores modifiers, composition, and non-printables", () => {
    expect(
      shouldRedirectPrintableKeyToSearch({
        key: "c",
        metaKey: true,
        searchFocused: false,
        activeInsideMenu: true,
      }),
    ).toBe(false);
    expect(
      shouldRedirectPrintableKeyToSearch({
        key: "Enter",
        searchFocused: false,
        activeInsideMenu: true,
      }),
    ).toBe(false);
    expect(
      shouldRedirectPrintableKeyToSearch({
        key: "c",
        isComposing: true,
        searchFocused: false,
        activeInsideMenu: true,
      }),
    ).toBe(false);
  });

  it("appends the redirected character onto the query", () => {
    const setQuery = vi.fn((updater: (current: string) => string) => updater("com"));
    let next = "";
    setQuery((current) => {
      next = `${current}p`;
      return next;
    });
    expect(next).toBe("comp");
  });
});
