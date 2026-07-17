"use client";

import { Command } from "cmdk";
import type { GlobalSearchResult } from "@backsteros/contracts";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { NavigationItemIcon } from "@/components/shell/navigation-item-icon";
import { Icon } from "@/components/ui/icon";
import {
  buildGoNavigationItems,
  goNavigationItemSearchValue,
} from "@/lib/command-palette/go-items";
import type { CommandPaletteFilterMode } from "@/lib/command-palette/types";
import { getProjectDocumentHref } from "@/lib/document-navigation-path";
import { getKnowledgeDocumentHref } from "@/lib/knowledge/navigation-path";
import { navigation } from "@/lib/navigation";
import { NAVIGATION_GO_LETTER_HINT } from "@/lib/shortcuts/navigation-shortcut-bindings";
import { useCommandPaletteSearch } from "@/hooks/use-command-palette-search";

const FILTER_PLACEHOLDERS: Partial<Record<CommandPaletteFilterMode, string>> = {
  projects: "Search projects…",
  tasks: "Search tasks…",
  documents: "Search documents…",
  letters: "Search letters…",
  knowledge: "Search knowledge…",
  contacts: "Search contacts…",
  organizations: "Search organizations…",
};

function hrefForSearchResult(result: GlobalSearchResult): string {
  switch (result.type) {
    case "project":
      return `/projects/${result.id}`;
    case "task":
      return `/tasks/${result.id}`;
    case "document": {
      const path = result.path?.trim() || "";
      if (result.documentType === "knowledge") {
        return getKnowledgeDocumentHref(path);
      }
      if (result.projectId) {
        return getProjectDocumentHref(result.projectId, path);
      }
      return "/projects";
    }
    case "organization":
      return `/organizations/${result.id}`;
    case "contact":
      return `/contacts/${result.id}`;
    case "letter":
      return `/letters/${result.id}`;
    default:
      return "/";
  }
}

export function CommandPalette() {
  const { open, setOpen, mode, toggle } = useCommandPalette();
  const isGoMode = mode === "go";
  const router = useRouter();
  const goItems = useMemo(() => buildGoNavigationItems(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [goQuery, setGoQuery] = useState("");

  const {
    filterMode,
    searchTerm,
    setSearchTerm,
    clearAllContextLayers,
    peelContextLayer,
    handleTabKey,
    reset,
    groupedResults,
    activeSections,
    loading,
    remoteError,
    hasContextLayers,
    contextBreadcrumb,
    trimmedSearch,
  } = useCommandPaletteSearch({ enabled: open && !isGoMode });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (event.altKey || event.shiftKey) {
          return;
        }
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [toggle]);

  useEffect(() => {
    if (!open) {
      reset();
      setGoQuery("");
    }
  }, [open, reset]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
  };

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
  }, [open, isGoMode]);

  const visit = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const inputPlaceholder = isGoMode
    ? `Type a letter… ${NAVIGATION_GO_LETTER_HINT}`
    : (FILTER_PLACEHOLDERS[filterMode] ??
      "Search everything… (p t d l k c o + Tab or space)");

  const showContextBreadcrumb = !isGoMode && contextBreadcrumb.length > 0;
  const showWorkspaceResults = !isGoMode && trimmedSearch.length > 0;
  const hasWorkspaceHits = activeSections.some(
    (section) => groupedResults[section].length > 0,
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label={isGoMode ? "Go to" : "Navigate Backsteros"}
      overlayClassName="command-overlay"
      contentClassName="command-dialog"
      shouldFilter={isGoMode || !showWorkspaceResults}
    >
      <div className="command-chrome">
        {showContextBreadcrumb ? (
          <nav className="command-context-breadcrumb" aria-label="Search context">
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
          ) : (
            <Icon name="search" />
          )}
          <Command.Input
            ref={inputRef}
            autoFocus
            className="command-input"
            placeholder={inputPlaceholder}
            value={isGoMode ? goQuery : searchTerm}
            onValueChange={(value) => {
              if (isGoMode) {
                setGoQuery(value);
                return;
              }
              setSearchTerm(value);
            }}
            onKeyDown={(event) => {
              const inputValue = isGoMode ? goQuery : searchTerm;
              const inputEmpty = inputValue.length === 0;
              const notComposing = !event.nativeEvent.isComposing;

              if (
                isGoMode &&
                event.key === "Backspace" &&
                inputEmpty &&
                notComposing
              ) {
                event.preventDefault();
                handleOpenChange(false);
                return;
              }

              if (
                !isGoMode &&
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
                !isGoMode &&
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

              if (!isGoMode && isClearKey && hasContextLayers) {
                event.preventDefault();
                clearAllContextLayers();
              }
            }}
          />
          {!isGoMode ? <kbd>⌘K</kbd> : null}
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
                    onSelect={() => visit(item.href)}
                  >
                    <NavigationItemIcon navId={item.id} />
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
                    {navigation.map((item) => (
                      <Command.Item
                        key={item.href}
                        value={`${item.label} ${item.href}`}
                        className="command-item"
                        onSelect={() => visit(item.href)}
                      >
                        <NavigationItemIcon navId={item.icon} />
                        <span className="command-item-label">{item.label}</span>
                        <small>{item.href}</small>
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
                  {activeSections.map((section) => {
                    const items = groupedResults[section];
                    if (items.length === 0) return null;
                    return (
                      <Command.Group key={section} heading={section}>
                        {items.map((result) => (
                          <Command.Item
                            key={`${result.type}:${result.id}`}
                            value={`${result.title} ${result.snippet ?? ""} ${result.id}`}
                            className="command-item"
                            onSelect={() => visit(hrefForSearchResult(result))}
                          >
                            <span className="command-item-label">
                              {result.title}
                            </span>
                            <small>{result.type}</small>
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
