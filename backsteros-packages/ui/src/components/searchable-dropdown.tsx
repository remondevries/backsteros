"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { isListKeyboardActivateKey } from "../is-list-keyboard-activate-key.js";
import { SEARCHABLE_DROPDOWN_REQUEST_CLOSE } from "../searchable-dropdown-events.js";
import type { SearchableDropdownMenuApi } from "../searchable-dropdown-menu-api.js";
import { consumeSearchableDropdownOpenPlacement } from "../searchable-dropdown-open-placement.js";
import {
  searchableDropdownShortcut,
  searchableDropdownShortcutIndex,
} from "../searchable-dropdown-shortcuts.js";
import { openAdjacentSearchableDropdown } from "../searchable-dropdown-tab-chain.js";
import type { TaskPropertyDropdownId } from "../task-property-dropdown-keys.js";

export type SearchableDropdownOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  searchTerms?: string;
};

const DEFAULT_PANEL_WIDTH = 280;
const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

export {
  searchableDropdownShortcut,
  searchableDropdownShortcutIndex,
} from "../searchable-dropdown-shortcuts.js";

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function filterOptions<T extends string>(
  options: SearchableDropdownOption<T>[],
  query: string,
): SearchableDropdownOption<T>[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter((option) => {
    const haystack = `${option.label} ${option.searchTerms ?? ""}`
      .trim()
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export type SearchableDropdownProps<T extends string> = {
  value: T | null;
  options: SearchableDropdownOption<T>[];
  onChange?: (value: T) => void;
  disabled?: boolean;
  searchPlaceholder?: string;
  searchShortcutLabel?: string;
  ariaLabel: string;
  className?: string;
  triggerClassName?: string;
  /** Fixed pixel width, or `"trigger"` to match the trigger’s width. */
  panelWidth?: number | "trigger";
  panelAlign?: "start" | "end";
  panelPlacement?: "anchored" | "center";
  registerOpenMenu?: (api: SearchableDropdownMenuApi | null) => void;
  taskPropertyDropdownId?: TaskPropertyDropdownId;
  /** When Enter is pressed with a non-empty query, return true if handled. */
  onQuerySubmit?: (query: string) => boolean;
  /** Optional preview line while typing (e.g. natural-language due dates). */
  queryPreviewLabel?: (query: string) => string | null;
  createFromQueryLabel?: (query: string) => string | null;
  onCreateFromQuery?: (query: string) => void;
  onTabFromSearch?: () => void;
  onShiftTabFromSearch?: () => void;
  renderTrigger?: (props: {
    selected: SearchableDropdownOption<T> | null;
    open: boolean;
    disabled: boolean;
    triggerId: string;
    onToggle: () => void;
  }) => ReactNode;
};

/**
 * Presentational searchable dropdown (portal panel).
 * Matches Next.js keyboard/placement/create-from-query behavior.
 */
export function SearchableDropdown<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  searchPlaceholder = "Search…",
  searchShortcutLabel,
  ariaLabel,
  className,
  triggerClassName,
  panelWidth = DEFAULT_PANEL_WIDTH,
  panelAlign = "start",
  panelPlacement = "anchored",
  registerOpenMenu,
  taskPropertyDropdownId,
  onQuerySubmit,
  queryPreviewLabel,
  createFromQueryLabel,
  onCreateFromQuery,
  onTabFromSearch,
  onShiftTabFromSearch,
  renderTrigger,
}: SearchableDropdownProps<T>) {
  const fallbackId = useId();
  const triggerId = `searchable-dropdown-${fallbackId.replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [listFocusActive, setListFocusActive] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });
  const [activePanelPlacement, setActivePanelPlacement] = useState<
    "anchored" | "center"
  >(panelPlacement);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filteredOptions = useMemo(
    () => filterOptions(options, query),
    [options, query],
  );

  const queryPreview = useMemo(
    () => (query.trim() ? (queryPreviewLabel?.(query) ?? null) : null),
    [query, queryPreviewLabel],
  );

  const createQueryLabel = useMemo(
    () =>
      query.trim() && filteredOptions.length === 0
        ? (createFromQueryLabel?.(query) ?? null)
        : null,
    [createFromQueryLabel, filteredOptions.length, query],
  );

  const hasCreateOption = Boolean(createQueryLabel && onCreateFromQuery);
  const navigableOptionCount = hasCreateOption
    ? 1
    : filteredOptions.length;

  const safeActiveIndex =
    navigableOptionCount === 0
      ? 0
      : Math.min(activeIndex, navigableOptionCount - 1);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setListFocusActive(false);
    setPanelStyle({ visibility: "hidden" });
  }, []);

  const selectCreateFromQuery = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed || !onCreateFromQuery) {
      return;
    }

    onCreateFromQuery(trimmed);
    window.requestAnimationFrame(() => {
      close();
    });
  }, [close, onCreateFromQuery, query]);

  const selectOption = useCallback(
    (option: SearchableDropdownOption<T>) => {
      onChange?.(option.value);
      window.requestAnimationFrame(() => {
        close();
      });
    },
    [close, onChange],
  );

  const openMenu = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setActiveIndex(0);
    setListFocusActive(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    setActivePanelPlacement(
      consumeSearchableDropdownOpenPlacement(rootRef.current, panelPlacement),
    );
  }, [open, panelPlacement]);

  const toggleMenu = useCallback(() => {
    if (disabled) return;
    if (open) {
      close();
      return;
    }
    openMenu();
  }, [close, disabled, open, openMenu]);

  const updatePanelPosition = useCallback(() => {
    const root = rootRef.current;
    const trigger =
      document.getElementById(triggerId) ??
      root?.querySelector("button");
    const triggerWidth =
      trigger?.getBoundingClientRect().width ?? DEFAULT_PANEL_WIDTH;
    const width =
      panelWidth === "trigger"
        ? Math.max(160, Math.round(triggerWidth))
        : panelWidth;

    if (panelPlacement === "center" || activePanelPlacement === "center") {
      const panelHeight = panelRef.current?.offsetHeight ?? 320;
      const left = Math.max(
        VIEWPORT_PADDING,
        (window.innerWidth - width) / 2,
      );
      const top = Math.max(
        VIEWPORT_PADDING,
        (window.innerHeight - panelHeight) / 2,
      );

      setPanelStyle({
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        visibility: "visible",
      });
      return;
    }

    if (!root || !trigger) return;

    const rect = trigger.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
    let left = panelAlign === "end" ? rect.right - width : rect.left;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

    const panelHeight = panelRef.current?.offsetHeight ?? 320;
    const spaceBelow =
      window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight && rect.top > panelHeight + PANEL_GAP;
    const top = openUpward
      ? Math.max(VIEWPORT_PADDING, rect.top - panelHeight - PANEL_GAP)
      : rect.bottom + PANEL_GAP;

    setPanelStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      visibility: "visible",
    });
  }, [
    activePanelPlacement,
    panelAlign,
    panelPlacement,
    panelWidth,
    triggerId,
  ]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const frame = window.requestAnimationFrame(() => {
      updatePanelPosition();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, filteredOptions.length, query, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;

    function handleReposition() {
      updatePanelPosition();
    }

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    registerOpenMenu?.({ open: openMenu, close });
    return () => registerOpenMenu?.(null);
  }, [close, openMenu, registerOpenMenu]);

  useEffect(() => {
    function handleRequestClose() {
      close();
    }

    window.addEventListener(
      SEARCHABLE_DROPDOWN_REQUEST_CLOSE,
      handleRequestClose,
    );
    return () =>
      window.removeEventListener(
        SEARCHABLE_DROPDOWN_REQUEST_CLOSE,
        handleRequestClose,
      );
  }, [close]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [close, open]);

  const scrollActiveOptionIntoView = useCallback(() => {
    const listbox = listboxRef.current;
    if (!listbox) {
      return;
    }

    const activeOption = listbox.querySelector<HTMLElement>(
      '[data-searchable-dropdown-option-active="true"]',
    );
    activeOption?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    if (!open || !listFocusActive) {
      return;
    }

    scrollActiveOptionIntoView();
  }, [safeActiveIndex, listFocusActive, open, scrollActiveOptionIntoView]);

  const moveActiveIndex = useCallback(
    (direction: "up" | "down") => {
      if (navigableOptionCount === 0) {
        return;
      }

      setActiveIndex((current) => {
        const delta = direction === "down" ? 1 : -1;
        return Math.max(0, Math.min(current + delta, navigableOptionCount - 1));
      });
    },
    [navigableOptionCount],
  );

  const focusListbox = useCallback(() => {
    window.requestAnimationFrame(() => {
      listboxRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const focusSearchField = useCallback(() => {
    setListFocusActive(false);
    window.requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const activateListFocus = useCallback(
    (index = 0) => {
      if (navigableOptionCount === 0) {
        return;
      }

      setListFocusActive(true);
      setActiveIndex(
        Math.max(0, Math.min(index, navigableOptionCount - 1)),
      );
      searchRef.current?.blur();
      focusListbox();
    },
    [focusListbox, navigableOptionCount],
  );

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) {
        if (onShiftTabFromSearch) {
          onShiftTabFromSearch();
          return;
        }
        if (openAdjacentSearchableDropdown(rootRef.current, "previous")) {
          return;
        }
        close();
        window.requestAnimationFrame(() => {
          document.getElementById(triggerId)?.focus();
        });
        return;
      }
      if (onTabFromSearch) {
        onTabFromSearch();
        return;
      }
      if (openAdjacentSearchableDropdown(rootRef.current, "next")) {
        return;
      }
      activateListFocus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activateListFocus(0);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      activateListFocus(Math.max(0, navigableOptionCount - 1));
      return;
    }

    if (!query.trim()) {
      if (event.key === "j") {
        event.preventDefault();
        activateListFocus(0);
        return;
      }

      if (event.key === "k") {
        event.preventDefault();
        activateListFocus(Math.max(0, navigableOptionCount - 1));
        return;
      }
    }

    if (event.key === "Enter") {
      if (event.metaKey || event.ctrlKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const trimmed = query.trim();
      if (trimmed && onQuerySubmit?.(trimmed)) {
        close();
        return;
      }
      if (hasCreateOption && safeActiveIndex === 0) {
        selectCreateFromQuery();
        return;
      }
      const option = filteredOptions[safeActiveIndex];
      if (option) selectOption(option);
    }
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) {
        focusSearchField();
        return;
      }
      if (onTabFromSearch) {
        onTabFromSearch();
        return;
      }
      if (openAdjacentSearchableDropdown(rootRef.current, "next")) {
        return;
      }
      return;
    }

    if (event.key === "j" || event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveIndex("down");
      return;
    }

    if (event.key === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveIndex("up");
      return;
    }

    if (isListKeyboardActivateKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      if (hasCreateOption && safeActiveIndex === 0) {
        selectCreateFromQuery();
        return;
      }
      const option = filteredOptions[safeActiveIndex];
      if (option) {
        selectOption(option);
      }
      return;
    }

    const shortcutIndex = searchableDropdownShortcutIndex(event.key);
    if (shortcutIndex != null && shortcutIndex < filteredOptions.length) {
      event.preventDefault();
      event.stopPropagation();
      selectOption(filteredOptions[shortcutIndex]!);
    }
  }

  const defaultTrigger = (
    <button
      type="button"
      id={triggerId}
      data-task-property-dropdown={taskPropertyDropdownId}
      className={["property-dropdown-trigger", triggerClassName]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        toggleMenu();
      }}
    >
      {selected?.icon ? (
        <span className="property-dropdown-trigger__icon" aria-hidden="true">
          {selected.icon}
        </span>
      ) : null}
      <span className="property-dropdown-trigger__label">
        {selected?.label ?? "Select…"}
      </span>
    </button>
  );

  return (
    <div
      ref={rootRef}
      data-searchable-dropdown-root=""
      data-task-property-dropdown={taskPropertyDropdownId}
      className={["searchable-dropdown-root", className]
        .filter(Boolean)
        .join(" ")}
    >
      {renderTrigger
        ? renderTrigger({
            selected,
            open,
            disabled,
            triggerId,
            onToggle: toggleMenu,
          })
        : defaultTrigger}

      {open
        ? createPortal(
            <div
              ref={panelRef}
              data-searchable-dropdown-panel=""
              className="searchable-dropdown-panel"
              style={panelStyle}
              role="presentation"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="searchable-dropdown-panel__search">
                <input
                  ref={searchRef}
                  type="search"
                  className="searchable-dropdown-panel__input"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  onFocus={() => setListFocusActive(false)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                />
                {searchShortcutLabel ? (
                  <span
                    className="searchable-dropdown-panel__shortcut"
                    aria-hidden="true"
                  >
                    {searchShortcutLabel}
                  </span>
                ) : null}
              </div>

              {queryPreview ? (
                <div
                  className="searchable-dropdown-panel__preview"
                  aria-live="polite"
                >
                  {queryPreview}
                </div>
              ) : null}

              <ul
                ref={listboxRef}
                className="searchable-dropdown-panel__list"
                role="listbox"
                aria-labelledby={triggerId}
                aria-activedescendant={
                  listFocusActive && navigableOptionCount > 0
                    ? hasCreateOption
                      ? `${triggerId}-option-create`
                      : filteredOptions[safeActiveIndex]
                        ? `${triggerId}-option-${filteredOptions[safeActiveIndex]!.value}`
                        : undefined
                    : undefined
                }
                tabIndex={-1}
                onKeyDown={handleListKeyDown}
              >
                {hasCreateOption ? (
                  <li key="__create__" role="presentation">
                    <button
                      type="button"
                      id={`${triggerId}-option-create`}
                      role="option"
                      aria-selected={false}
                      data-searchable-dropdown-option-active={
                        listFocusActive && safeActiveIndex === 0
                          ? "true"
                          : undefined
                      }
                      className={[
                        "searchable-dropdown-panel__option",
                        listFocusActive && safeActiveIndex === 0
                          ? "keyboard-nav-item-highlight"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() => {
                        setListFocusActive(false);
                        setActiveIndex(0);
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectCreateFromQuery();
                      }}
                    >
                      <span className="searchable-dropdown-panel__option-label searchable-dropdown-panel__option-label--muted">
                        {createQueryLabel}
                      </span>
                    </button>
                  </li>
                ) : filteredOptions.length === 0 ? (
                  <li
                    className="searchable-dropdown-panel__empty"
                    role="presentation"
                  >
                    {queryPreview ? "Press Enter to apply" : "No matches"}
                  </li>
                ) : (
                  filteredOptions.map((option, index) => {
                    const isSelected = option.value === value;
                    const isActive = index === safeActiveIndex;
                    const showKeyboardHighlight = listFocusActive && isActive;
                    const shortcut =
                      option.shortcut ?? searchableDropdownShortcut(index);

                    return (
                      <li key={option.value} role="presentation">
                        <button
                          type="button"
                          id={`${triggerId}-option-${option.value}`}
                          role="option"
                          aria-selected={isSelected}
                          data-searchable-dropdown-option-active={
                            showKeyboardHighlight ? "true" : undefined
                          }
                          className={[
                            "searchable-dropdown-panel__option",
                            showKeyboardHighlight
                              ? "keyboard-nav-item-highlight"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onMouseEnter={() => {
                            setListFocusActive(false);
                            setActiveIndex(index);
                          }}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            selectOption(option);
                          }}
                        >
                          <span className="searchable-dropdown-panel__option-main">
                            {option.icon ? (
                              <span
                                className="searchable-dropdown-panel__option-icon"
                                aria-hidden="true"
                              >
                                {option.icon}
                              </span>
                            ) : null}
                            <span className="searchable-dropdown-panel__option-label">
                              {option.label}
                            </span>
                          </span>
                          <span className="searchable-dropdown-panel__option-trailing">
                            {isSelected ? (
                              <span
                                className="searchable-dropdown-panel__check"
                                aria-hidden="true"
                              >
                                <CheckIcon />
                              </span>
                            ) : null}
                            {shortcut ? (
                              <span
                                className="searchable-dropdown-panel__option-shortcut"
                                aria-hidden="true"
                              >
                                {shortcut}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
