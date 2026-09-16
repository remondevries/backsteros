"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  isEditableShortcutTarget,
  shouldHandleGlobalShortcut,
} from "../shortcuts/shortcut-guards.js";
import { isListDetailPanelOpen } from "./use-list-clear-selection-shortcut.js";
import {
  isForegroundListTypeToFilterOwner,
  isListTypeToFilterChar,
  isListTypeToFilterToggleShortcut,
  listItemMatchesTypeToFilter,
  popListTypeToFilterOwner,
  pushListTypeToFilterOwner,
  setListTypeToFilterQueryActive,
  setListTypeToFilterSearchModeActive,
} from "./list-type-to-filter.js";

/**
 * Yield Escape to an open list detail / entity rail (not the collapsed strip).
 */
export function shouldYieldListTypeToFilterEscape(): boolean {
  if (typeof document === "undefined") return false;
  if (isListDetailPanelOpen()) return true;
  return (
    document.querySelector(
      [
        '[data-contact-overlay-layout="panel"]',
        '[data-contact-overlay-layout="page"]',
        '[data-organization-overlay-layout="panel"]',
        '[data-organization-overlay-layout="page"]',
        '[data-domain-overlay-layout="panel"]',
        '[data-domain-overlay-layout="page"]',
        '[data-entity-overlay-layout="panel"]',
        '[data-entity-overlay-layout="page"]',
      ].join(", "),
    ) !== null
  );
}

export type ListTypeToFilterController = {
  /** Active filter text (may remain after leaving search mode). */
  query: string;
  /** When true, letter keys append to the query instead of list j/k nav. */
  searchMode: boolean;
  /**
   * Handle Escape for type-to-filter.
   * @returns true if Escape was consumed (caller should not run other Esc behavior).
   */
  handleEscape: () => boolean;
  clear: () => void;
};

/**
 * Shift+F list type-to-filter. Enable per list surface.
 *
 * While search mode is on, page hotkeys are suppressed (via the global shortcut
 * gate) and this handler owns keystrokes so every letter/symbol can be typed.
 *
 * Only the foreground (most recently enabled) owner receives keys — keeps
 * keep-alive background lists from stealing Shift+F.
 */
export function useListTypeToFilter(options: {
  enabled?: boolean;
  /**
   * When true, Escape will not clear a locked filter — caller should close
   * the open detail / side panel first. Search mode still exits on Escape.
   * Defaults to {@link shouldYieldListTypeToFilterEscape}.
   */
  shouldYieldEscape?: () => boolean;
}): ListTypeToFilterController {
  const enabled = options.enabled ?? true;
  const shouldYieldEscapeRef = useRef(options.shouldYieldEscape);
  shouldYieldEscapeRef.current =
    options.shouldYieldEscape ?? shouldYieldListTypeToFilterEscape;

  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const searchModeRef = useRef(searchMode);
  searchModeRef.current = searchMode;
  const queryRef = useRef(query);
  queryRef.current = query;

  const ownerId = useRef<symbol | null>(null);
  if (ownerId.current == null) {
    ownerId.current = Symbol("list-type-to-filter");
  }

  const clear = useCallback(() => {
    setQuery("");
    setSearchMode(false);
  }, []);

  const handleEscape = useCallback(() => {
    if (searchModeRef.current) {
      setSearchMode(false);
      return true;
    }
    if (shouldYieldEscapeRef.current?.()) {
      return false;
    }
    if (queryRef.current.length > 0) {
      setQuery("");
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = ownerId.current!;
    pushListTypeToFilterOwner(id);
    return () => popListTypeToFilterOwner(id);
  }, [enabled]);

  useEffect(() => {
    const foreground =
      enabled && isForegroundListTypeToFilterOwner(ownerId.current!);
    setListTypeToFilterSearchModeActive(foreground && searchMode);
    return () => {
      if (foreground) setListTypeToFilterSearchModeActive(false);
    };
  }, [enabled, searchMode]);

  useEffect(() => {
    const foreground =
      enabled && isForegroundListTypeToFilterOwner(ownerId.current!);
    setListTypeToFilterQueryActive(foreground && query.length > 0);
    return () => {
      if (foreground) setListTypeToFilterQueryActive(false);
    };
  }, [enabled, query]);

  useEffect(() => {
    if (!enabled) {
      setQuery("");
      setSearchMode(false);
      return;
    }

    function isForeground(): boolean {
      return isForegroundListTypeToFilterOwner(ownerId.current!);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isForeground()) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (isListTypeToFilterToggleShortcut(event)) {
        if (!searchModeRef.current && !shouldHandleGlobalShortcut(event)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSearchMode((current) => !current);
        return;
      }

      const editingField =
        isEditableShortcutTarget(event.target) ||
        (typeof document !== "undefined" &&
          isEditableShortcutTarget(document.activeElement));

      if (event.key === "Escape" && !editingField) {
        if (!handleEscape()) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      if (!searchModeRef.current) return;
      if (editingField) return;

      if (
        event.key === "Shift" ||
        event.key === "Control" ||
        event.key === "Alt" ||
        event.key === "Meta"
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.key === "Enter") {
        setSearchMode(false);
        return;
      }
      if (event.key === "Backspace") {
        setQuery((current) => current.slice(0, -1));
        return;
      }
      if (isListTypeToFilterChar(event.key)) {
        setQuery((current) => current + event.key.toLowerCase());
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, handleEscape]);

  return {
    query,
    searchMode,
    handleEscape,
    clear,
  };
}

/**
 * Filter a list with Shift+F type-to-filter. Returns filtered items + searchMode
 * (search mode styles the List/Board toggle via body[data-list-type-to-filter-search]).
 */
export function useListTypeToFilterItems<T>(options: {
  enabled?: boolean;
  items: readonly T[];
  getHaystacks: (item: T) => Array<string | null | undefined>;
  shouldYieldEscape?: () => boolean;
}): {
  items: T[];
  query: string;
  searchMode: boolean;
  handleEscape: () => boolean;
  clear: () => void;
} {
  const filter = useListTypeToFilter({
    enabled: options.enabled,
    shouldYieldEscape: options.shouldYieldEscape,
  });

  // Stable id so getHaystacks identity churn does not matter for filtering.
  const getHaystacksRef = useRef(options.getHaystacks);
  getHaystacksRef.current = options.getHaystacks;

  const items = useMemo(() => {
    if (!filter.query) return [...options.items];
    return options.items.filter((item) =>
      listItemMatchesTypeToFilter(
        filter.query,
        ...getHaystacksRef.current(item),
      ),
    );
  }, [filter.query, options.items]);

  return {
    items,
    query: filter.query,
    searchMode: filter.searchMode,
    handleEscape: filter.handleEscape,
    clear: filter.clear,
  };
}
