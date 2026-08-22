"use client";

import { Command } from "cmdk";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  activateFilterModeFromTab,
  applyAllModeInputChange,
  applyScopedModeInputChange,
  commandPaletteSectionsForMode,
  createDefaultCommandPaletteFilterState,
  DEFAULT_GO_NAVIGATION_ITEMS,
  goNavigationItemSearchValue,
  isScopedFilterMode,
  NAVIGATION_GO_LETTER_HINT,
  type CommandPaletteFilterMode,
  type CommandPaletteFilterState,
  type CommandPaletteHit,
  type GoNavigationItem,
} from "../command-palette/command-palette.js";
import {
  buildCommandPaletteContextBreadcrumb,
  peelRouteSearchContext,
} from "../command-palette/context-breadcrumb.js";
import {
  appendCommandPaletteSearchParams,
  resolveCommandPaletteSearchContext,
  type CommandPaletteSearchContext,
} from "../command-palette/search-context.js";
import {
  DEFAULT_FINANCE_GO_NAVIGATION_ITEMS,
  FINANCE_GO_LETTER_HINT,
  financeGoNavigationItemSearchValue,
  type FinanceGoNavigationItem,
} from "../finance/finance-nav.js";
import { navigation } from "../navigation/navigation.js";
import { isCommandPaletteToggleKey } from "../command-palette/command-palette-toggle-key.js";
import {
  useCommandPalette,
  type CommandPaletteMode,
} from "./command-palette-context.js";
import { FinanceSectionNavIcon } from "./finance-side-panel-nav-view.js";
import { NavigationItemIcon } from "./navigation-item-icon.js";
import { SearchNavIcon } from "./sidebar-nav-icons.js";

/** Native desktop menus (Tauri) dispatch this when ⌘K / Ctrl+K is pressed. */
export const TOGGLE_COMMAND_PALETTE_EVENT = "backsteros:toggle-command-palette";

const FILTER_PLACEHOLDERS: Partial<Record<CommandPaletteFilterMode, string>> = {
  projects: "Search projects…",
  tasks: "Search tasks…",
  documents: "Search documents…",
  letters: "Search letters…",
  knowledge: "Search knowledge…",
  contacts: "Search contacts…",
  organizations: "Search organizations…",
};

export type CommandPaletteViewProps = {
  navigate: (href: string) => void;
  pathname?: string;
  entityNames?: {
    projectName?: string | null;
    contactName?: string | null;
    organizationName?: string | null;
  };
  /** Resolve entity UUIDs for the current route context (optional). */
  resolveContextIds?: (context: CommandPaletteSearchContext | null) => {
    projectId?: string | null;
    contactId?: string | null;
    organizationId?: string | null;
  };
  search?: (
    query: string,
    options?: { searchParams?: URLSearchParams },
  ) => Promise<CommandPaletteHit[]> | CommandPaletteHit[];
  goItems?: GoNavigationItem[];
  financeGoItems?: readonly FinanceGoNavigationItem[];
  destinations?: {
    id: string;
    label: string;
    href: string;
    iconId?: string;
    /** When set, selecting this item scopes search instead of navigating. */
    filterMode?: Exclude<CommandPaletteFilterMode, "all">;
  }[];
  /** Shortcut hint shown in the input row (default ⌘K). */
  shortcutHint?: string;
};

function withResolvedIds(
  context: CommandPaletteSearchContext | null,
  ids: {
    projectId?: string | null;
    contactId?: string | null;
    organizationId?: string | null;
  },
): CommandPaletteSearchContext | null {
  if (!context) return null;
  if (context.kind === "project") {
    return { ...context, projectId: ids.projectId ?? undefined };
  }
  if (context.kind === "contact") {
    return { ...context, contactId: ids.contactId ?? undefined };
  }
  if (context.kind === "organization") {
    return { ...context, organizationId: ids.organizationId ?? undefined };
  }
  return context;
}

export function CommandPaletteView({
  navigate,
  pathname = "/",
  entityNames,
  resolveContextIds,
  search,
  goItems = DEFAULT_GO_NAVIGATION_ITEMS,
  financeGoItems = DEFAULT_FINANCE_GO_NAVIGATION_ITEMS,
  destinations,
  shortcutHint = "⌘K",
}: CommandPaletteViewProps) {
  const { open, setOpen, mode, toggle, openSearch, openGo, openFinanceGo } =
    useCommandPalette();
  const isGoMode = mode === "go";
  const isFinanceGoMode = mode === "finance-go";
  const isLeaderNavMode = isGoMode || isFinanceGoMode;
  const inputRef = useRef<HTMLInputElement>(null);
  const lastToggleAtRef = useRef(0);
  const modeRef = useRef(mode);
  const goQueryRef = useRef("");
  const [filter, setFilter] = useState<CommandPaletteFilterState>(
    createDefaultCommandPaletteFilterState,
  );
  const [goQuery, setGoQuery] = useState("");
  const [hits, setHits] = useState<CommandPaletteHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [manualContext, setManualContext] =
    useState<CommandPaletteSearchContext | null>(null);
  const [contextDismissed, setContextDismissed] = useState(false);
  const [routeContextOverride, setRouteContextOverride] =
    useState<CommandPaletteSearchContext | null>(null);

  modeRef.current = mode;
  goQueryRef.current = goQuery;

  const navDestinations = useMemo(() => {
    if (destinations) return destinations;
    return navigation.map((item) => ({
      id: item.icon,
      label: item.label,
      href: item.href,
      iconId: item.icon,
      filterMode: undefined as
        | Exclude<CommandPaletteFilterMode, "all">
        | undefined,
    }));
  }, [destinations]);

  const searchContext = useMemo(
    () => resolveCommandPaletteSearchContext(pathname, entityNames),
    [entityNames, pathname],
  );

  const effectiveRouteContext = routeContextOverride ?? searchContext;
  const baseSearchContext =
    manualContext ??
    (filter.mode === "all" && !contextDismissed
      ? effectiveRouteContext
      : null);
  const activeSearchContext = useMemo(
    () =>
      withResolvedIds(
        baseSearchContext,
        resolveContextIds?.(baseSearchContext) ?? {},
      ),
    [baseSearchContext, resolveContextIds],
  );

  const contextBreadcrumb = useMemo(
    () =>
      buildCommandPaletteContextBreadcrumb({
        filterMode: filter.mode,
        manualContext,
        routeContext: effectiveRouteContext,
        contextDismissed,
      }),
    [
      contextDismissed,
      effectiveRouteContext,
      filter.mode,
      manualContext,
    ],
  );
  const hasContextLayers = contextBreadcrumb.length > 0;
  const wasOpenRef = useRef(open);

  useEffect(() => {
    const runToggle = () => {
      // Debounce: macOS may deliver both the native menu accelerator and a
      // residual keydown; without this the palette would open then immediately close.
      const now = Date.now();
      if (now - lastToggleAtRef.current < 350) {
        return;
      }
      lastToggleAtRef.current = now;
      toggle();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCommandPaletteToggleKey(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      runToggle();
    };

    const onNativeToggle = () => {
      runToggle();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(TOGGLE_COMMAND_PALETTE_EVENT, onNativeToggle);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(TOGGLE_COMMAND_PALETTE_EVENT, onNativeToggle);
    };
  }, [toggle]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    // Reset only when the palette closes — not on every mount while closed.
    if (open || !wasOpen) return;
    setFilter(createDefaultCommandPaletteFilterState());
    setGoQuery("");
    setHits([]);
    setLoading(false);
    setRemoteError(null);
    setManualContext(null);
    setRouteContextOverride(null);
    setContextDismissed(false);
  }, [open]);

  useEffect(() => {
    setContextDismissed((current) => (current ? false : current));
    setRouteContextOverride((current) => (current != null ? null : current));
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let frame = 0;
    let attempts = 0;
    const focusInput = () => {
      const input = inputRef.current;
      if (input && document.activeElement !== input) {
        input.focus();
      }
      attempts += 1;
      if (attempts < 5) {
        frame = requestAnimationFrame(focusInput);
      }
    };
    focusInput();
    return () => cancelAnimationFrame(frame);
  }, [open, isLeaderNavMode]);

  // Capture-phase: peel Finance → Go even if focus left the input (list click / cmdk root).
  useEffect(() => {
    if (!open) return;

    function handleLeaderBackspace(event: KeyboardEvent) {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.repeat) return;
      if (event.isComposing || event.keyCode === 229) return;

      const modeNow = modeRef.current;
      if (modeNow !== "finance-go" && modeNow !== "go") return;

      const queryEmpty =
        goQueryRef.current.length === 0 &&
        (inputRef.current == null || inputRef.current.value.length === 0);
      if (!queryEmpty) return;

      if (modeNow === "finance-go") {
        event.preventDefault();
        event.stopImmediatePropagation();
        openGo();
        setGoQuery("");
        goQueryRef.current = "";
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    }

    window.addEventListener("keydown", handleLeaderBackspace, true);
    return () =>
      window.removeEventListener("keydown", handleLeaderBackspace, true);
  }, [open, openGo, setOpen]);

  useEffect(() => {
    if (!open || isLeaderNavMode) return;
    const query = filter.searchTerm.trim();
    if (!query) {
      setHits((current) => (current.length === 0 ? current : []));
      setLoading((current) => (current ? false : current));
      setRemoteError((current) => (current != null ? null : current));
      return;
    }
    if (!search) {
      const local = navDestinations
        .filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase()),
        )
        .map((item) => ({
          id: item.id,
          type: "nav",
          title: item.label,
          href: item.href,
          section: "Projects" as const,
        }));
      setHits(local);
      setLoading(false);
      setRemoteError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setRemoteError(null);
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, limit: "20" });
      appendCommandPaletteSearchParams(params, {
        mode: filter.mode,
        context: activeSearchContext,
      });
      void Promise.resolve(search(query, { searchParams: params }))
        .then((results) => {
          if (cancelled) return;
          setHits(results);
          setLoading(false);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setRemoteError(
            error instanceof Error ? error.message : "Search failed",
          );
          setHits([]);
          setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    activeSearchContext,
    filter.mode,
    filter.searchTerm,
    isLeaderNavMode,
    navDestinations,
    open,
    search,
  ]);

  const trimmed = filter.searchTerm.trim();
  const showWorkspaceResults = !isLeaderNavMode && trimmed.length > 0;
  const sections = commandPaletteSectionsForMode(filter.mode);
  const groupedResults = useMemo(() => {
    const grouped = Object.fromEntries(
      sections.map((section) => [section, [] as CommandPaletteHit[]]),
    ) as Record<(typeof sections)[number], CommandPaletteHit[]>;
    for (const hit of hits) {
      if (!sections.includes(hit.section)) continue;
      grouped[hit.section].push(hit);
    }
    return grouped;
  }, [hits, sections]);
  const hasWorkspaceHits = sections.some(
    (section) => groupedResults[section].length > 0,
  );

  const inputPlaceholder = isGoMode
    ? `Type a letter… ${NAVIGATION_GO_LETTER_HINT}`
    : isFinanceGoMode
      ? `Type a letter… ${FINANCE_GO_LETTER_HINT}`
      : (FILTER_PLACEHOLDERS[filter.mode] ??
        "Search everything… (p t d l k c o f + Tab or space)");

  const showContextBreadcrumb = !isLeaderNavMode && contextBreadcrumb.length > 0;

  function closeAndNavigate(href: string) {
    setOpen(false);
    navigate(href);
  }

  /** `f ` (or lone `f` + Tab) scopes into Finance go destinations. */
  function enterFinanceGo(remainder = "") {
    openFinanceGo();
    setGoQuery(remainder);
  }

  /** Peel Finance chip → global Go destinations (same list as pressing G). */
  function peelFinanceGoToGlobalGo() {
    openGo();
    setGoQuery("");
    goQueryRef.current = "";
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function tryEnterFinanceGoFromTypedValue(value: string): boolean {
    if (!value.startsWith("f ")) {
      return false;
    }
    enterFinanceGo(value.slice(2));
    return true;
  }

  function peelContextLayer(): boolean {
    if (manualContext) {
      setManualContext(null);
      return true;
    }

    if (isScopedFilterMode(filter.mode)) {
      setFilter(createDefaultCommandPaletteFilterState());
      return true;
    }

    if (
      !contextDismissed &&
      effectiveRouteContext &&
      filter.mode === "all"
    ) {
      const peeled = peelRouteSearchContext(effectiveRouteContext);
      if (peeled == null) {
        setRouteContextOverride(null);
        setContextDismissed(true);
        return true;
      }
      setRouteContextOverride(peeled);
      return true;
    }

    return false;
  }

  function clearAllContextLayers() {
    setFilter(createDefaultCommandPaletteFilterState());
    setManualContext(null);
    setRouteContextOverride(null);
    setContextDismissed(true);
  }

  function setSearchTerm(value: string) {
    if (filter.mode === "all" && tryEnterFinanceGoFromTypedValue(value)) {
      return;
    }
    if (filter.mode === "all") {
      const next = applyAllModeInputChange(value, filter);
      if (next) setFilter(next);
      return;
    }
    const next = applyScopedModeInputChange(value, filter);
    if (next) setFilter(next);
  }

  function handleTabKey(): boolean {
    if (filter.mode !== "all") {
      return false;
    }
    if (filter.searchTerm.trim().toLowerCase() === "f") {
      enterFinanceGo();
      return true;
    }
    const activated = activateFilterModeFromTab(filter.searchTerm);
    if (!activated) {
      return false;
    }
    setFilter(activated);
    return true;
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label={isGoMode ? "Go to" : isFinanceGoMode ? "Finance go to" : "Navigate Backsteros"}
      overlayClassName="command-overlay"
      contentClassName="command-dialog"
      shouldFilter={isLeaderNavMode || !showWorkspaceResults}
    >
      <div className="command-chrome" key={mode}>
        {showContextBreadcrumb ? (
          <nav
            className="command-context-breadcrumb"
            aria-label="Search context"
          >
            {contextBreadcrumb.map((segment, index) => (
              <Fragment key={`${segment}-${index}`}>
                {index > 0 ? (
                  <span
                    className="command-context-breadcrumb-separator"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                ) : null}
                <span
                  className={`command-context-breadcrumb-pill${
                    index === contextBreadcrumb.length - 1
                      ? " command-context-breadcrumb-pill-current"
                      : ""
                  }`}
                >
                  {segment}
                </span>
              </Fragment>
            ))}
          </nav>
        ) : null}
        <div className="command-input-row">
          {isGoMode ? (
            <span className="command-filter-chip" aria-label="Go filter active">
              Go
            </span>
          ) : isFinanceGoMode ? (
            <button
              type="button"
              className="command-filter-chip"
              aria-label="Clear Finance filter"
              title="Backspace to show all destinations"
              onClick={() => {
                peelFinanceGoToGlobalGo();
              }}
            >
              Finance
            </button>
          ) : (
            <SearchNavIcon />
          )}
          <Command.Input
            ref={inputRef}
            autoFocus
            className="command-input"
            placeholder={inputPlaceholder}
            value={isLeaderNavMode ? goQuery : filter.searchTerm}
            onValueChange={(value: string) => {
              if (isGoMode) {
                if (tryEnterFinanceGoFromTypedValue(value)) {
                  return;
                }
                setGoQuery(value);
                return;
              }
              if (isFinanceGoMode) {
                setGoQuery(value);
                return;
              }
              setSearchTerm(value);
            }}
            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
              const inputValue = isLeaderNavMode ? goQuery : filter.searchTerm;
              const inputEmpty = inputValue.length === 0;
              const notComposing = !event.nativeEvent.isComposing;

              if (
                isFinanceGoMode &&
                event.key === "Backspace" &&
                inputEmpty &&
                notComposing
              ) {
                event.preventDefault();
                event.stopPropagation();
                peelFinanceGoToGlobalGo();
                return;
              }

              if (
                isGoMode &&
                event.key === "Backspace" &&
                inputEmpty &&
                notComposing
              ) {
                event.preventDefault();
                setOpen(false);
                return;
              }

              if (
                isGoMode &&
                event.key === "Tab" &&
                !event.shiftKey &&
                notComposing &&
                goQuery.trim().toLowerCase() === "f"
              ) {
                event.preventDefault();
                enterFinanceGo();
                return;
              }

              if (
                !isLeaderNavMode &&
                event.key === "Tab" &&
                event.shiftKey &&
                inputEmpty &&
                notComposing
              ) {
                if (peelContextLayer()) {
                  event.preventDefault();
                }
                return;
              }

              if (
                !isLeaderNavMode &&
                event.key === "Tab" &&
                !event.shiftKey &&
                notComposing
              ) {
                if (handleTabKey()) {
                  event.preventDefault();
                  return;
                }
              }

              const isClearKey =
                (event.key === "Backspace" || event.key === "Delete") &&
                inputEmpty &&
                notComposing;

              if (!isLeaderNavMode && isClearKey && hasContextLayers) {
                event.preventDefault();
                clearAllContextLayers();
              }
            }}
          />
          {!isLeaderNavMode ? <kbd>{shortcutHint}</kbd> : null}
        </div>
        <Command.List className="command-list">
          {isGoMode ? (
            <>
              <Command.Empty className="command-empty">
                No destination found.
              </Command.Empty>
              <Command.Group heading="Navigate">
                {goItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={goNavigationItemSearchValue(item)}
                    className="command-item"
                    onSelect={() => {
                      const destination = navDestinations.find(
                        (entry) => entry.id === item.id,
                      );
                      if (destination?.filterMode) {
                        openSearch();
                        setFilter({
                          mode: destination.filterMode,
                          searchTerm: "",
                        });
                        setManualContext(null);
                        setContextDismissed(true);
                        setRouteContextOverride(null);
                        setGoQuery("");
                        return;
                      }
                      closeAndNavigate(item.href);
                    }}
                  >
                    <NavigationItemIcon navId={item.id} />
                    <span className="command-item-label">{item.label}</span>
                    <small>{item.hint}</small>
                  </Command.Item>
                ))}
              </Command.Group>
            </>
          ) : isFinanceGoMode ? (
            <>
              <Command.Empty className="command-empty">
                No destination found.
              </Command.Empty>
              <Command.Group heading="Finance">
                {financeGoItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={financeGoNavigationItemSearchValue(item)}
                    className="command-item"
                    onSelect={() => closeAndNavigate(item.href)}
                  >
                    <FinanceSectionNavIcon id={item.id} />
                    <span className="command-item-label">{item.label}</span>
                    <small>{item.hint}</small>
                  </Command.Item>
                ))}
              </Command.Group>
            </>
          ) : (
            <>
              {!showWorkspaceResults ? (
                <>
                  <Command.Empty className="command-empty">
                    No destination found.
                  </Command.Empty>
                  <Command.Group heading="Navigate">
                    {navDestinations.map((item) => (
                      <Command.Item
                        key={item.href}
                        value={`${item.label} ${item.href}`}
                        className="command-item"
                        onSelect={() => {
                          if (item.filterMode) {
                            setFilter({
                              mode: item.filterMode,
                              searchTerm: "",
                            });
                            setManualContext(null);
                            setContextDismissed(true);
                            setRouteContextOverride(null);
                            return;
                          }
                          closeAndNavigate(item.href);
                        }}
                      >
                        {item.iconId ? (
                          <NavigationItemIcon navId={item.iconId} />
                        ) : null}
                        <span className="command-item-label">{item.label}</span>
                        <small>
                          {item.filterMode
                            ? `Search ${item.label.toLowerCase()}`
                            : item.href}
                        </small>
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              ) : (
                <>
                  {loading ? (
                    <div className="command-status">Searching…</div>
                  ) : null}
                  {remoteError ? (
                    <div className="command-status command-status-error">
                      {remoteError}
                    </div>
                  ) : null}
                  {!loading && !remoteError && !hasWorkspaceHits ? (
                    <Command.Empty className="command-empty">
                      No results found.
                    </Command.Empty>
                  ) : null}
                  {sections.map((section) => {
                    const items = groupedResults[section];
                    if (items.length === 0) return null;
                    return (
                      <Command.Group key={section} heading={section}>
                        {items.map((hit) => (
                          <Command.Item
                            key={`${hit.type}:${hit.id}`}
                            value={`${hit.title} ${hit.subtitle ?? ""} ${hit.id}`}
                            className="command-item"
                            onSelect={() => closeAndNavigate(hit.href)}
                          >
                            <span className="command-item-label">
                              {hit.title}
                            </span>
                            <small>{hit.type}</small>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    );
                  })}
                </>
              )}
            </>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}

export type { CommandPaletteMode };
