"use client";

import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useLatestRef } from "@/hooks/use-latest-ref";
import { useMentionCatalogOptional } from "@/hooks/use-mention-catalog";
import type { MentionMenuController } from "@/lib/documents/codemirror/mentions/mention-menu-controller";
import type {
  MentionCatalog,
  MentionItem,
  MentionMenuTriggerState,
  MentionSection,
} from "@/lib/documents/mentions/mention-menu-types";
import {
  buildMentionSections,
  flattenMentionSections,
} from "@/lib/documents/mentions/search-catalog";
import { buildMentionToken } from "@/lib/documents/mentions/tokens";

import { MentionLeadingIcon } from "./document-mention-chip";

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 360;
const POPUP_VERTICAL_GAP = 8;
const POPUP_HEADER_HEIGHT = 44;

type CaretRect = {
  left: number;
  top: number;
  bottom: number;
};

type DocumentMentionMenuProps = {
  view: EditorView | null;
  controller: MentionMenuController;
  catalog: MentionCatalog;
};

function positionMentionPanel(rect: CaretRect): {
  style: React.CSSProperties;
  maxBodyHeight: number;
} {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = POPUP_WIDTH;
  const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));

  const spaceAbove = Math.max(0, rect.top - POPUP_VERTICAL_GAP - 8);
  const spaceBelow = Math.max(
    0,
    viewportHeight - rect.bottom - POPUP_VERTICAL_GAP - 8,
  );
  const useAbove = spaceAbove >= POPUP_MAX_HEIGHT || spaceAbove >= spaceBelow;
  const available = useAbove ? spaceAbove : spaceBelow;
  const maxBodyHeight = Math.max(
    120,
    Math.min(POPUP_MAX_HEIGHT - POPUP_HEADER_HEIGHT, available - 8),
  );

  if (useAbove) {
    return {
      style: {
        left,
        bottom: viewportHeight - rect.top + POPUP_VERTICAL_GAP,
        width,
      },
      maxBodyHeight,
    };
  }

  return {
    style: {
      left,
      top: rect.bottom + POPUP_VERTICAL_GAP,
      width,
    },
    maxBodyHeight,
  };
}

function primaryLabel(item: MentionItem): string {
  switch (item.kind) {
    case "task":
      return item.title;
    case "project":
      return item.name;
    case "contact":
      return item.name;
    case "organization":
      return item.name;
    case "document":
      return item.title;
  }
}

function secondaryLabel(item: MentionItem): string | null {
  switch (item.kind) {
    case "task":
      return item.projectName;
    case "project":
      return null;
    case "contact":
      return item.organizationName ?? item.title;
    case "organization":
      return null;
    case "document":
      return `${item.projectKey}/${item.relativePath}`;
  }
}

function trailingHint(item: MentionItem): string | null {
  if (item.kind === "task") {
    return item.displayId;
  }
  if (
    item.kind === "project" ||
    item.kind === "contact" ||
    item.kind === "organization"
  ) {
    return item.key;
  }
  return null;
}

function mentionItemKey(item: MentionItem): string {
  return `${item.kind}:${item.id}`;
}

export function DocumentMentionMenu({
  view,
  controller,
  catalog,
}: DocumentMentionMenuProps) {
  const mentionCatalogApi = useMentionCatalogOptional();
  const [trigger, setTrigger] = useState<MentionMenuTriggerState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [caretRect, setCaretRect] = useState<CaretRect | null>(null);
  const [remoteResult, setRemoteResult] = useState<{
    query: string;
    sections: MentionSection[];
  } | null>(null);
  const listBodyRef = useRef<HTMLDivElement>(null);
  const previousTriggerFromRef = useRef<number | null>(null);

  const query = trigger?.query ?? "";

  useEffect(() => {
    if (!mentionCatalogApi || !trigger) {
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      void mentionCatalogApi.searchSections(query).then((sections) => {
        if (!cancelled) {
          setRemoteResult({ query, sections });
        }
      });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [mentionCatalogApi, query, trigger]);

  const sections = useMemo(() => {
    if (remoteResult?.query === query) {
      return remoteResult.sections;
    }
    return buildMentionSections(catalog, query);
  }, [catalog, query, remoteResult]);
  const flatItems = useMemo(() => flattenMentionSections(sections), [sections]);
  const safeSelectedIndex =
    flatItems.length === 0
      ? 0
      : Math.min(selectedIndex, flatItems.length - 1);

  const triggerRef = useLatestRef(trigger);
  const flatItemsRef = useLatestRef(flatItems);
  const selectedIndexRef = useLatestRef(safeSelectedIndex);

  const insertItem = useCallback(
    (item: MentionItem | undefined) => {
      const currentTrigger = triggerRef.current;
      const editorView = view;
      if (!currentTrigger || !item || !editorView) {
        return;
      }

      const token = buildMentionToken(item);
      editorView.dispatch({
        changes: {
          from: currentTrigger.from,
          to: currentTrigger.to,
          insert: token,
        },
        selection: { anchor: currentTrigger.from + token.length },
      });
      editorView.focus();
      controller.setState(null);
    },
    [controller, triggerRef, view],
  );

  useEffect(() => {
    controller.bindUi({
      onStateChange: (next) => {
        if (next?.from !== previousTriggerFromRef.current) {
          setSelectedIndex(0);
          previousTriggerFromRef.current = next?.from ?? null;
        }
        if (!next) {
          previousTriggerFromRef.current = null;
        }
        setTrigger(next);
      },
      keyHandlers: {
        navigateNext: () => {
          if (!triggerRef.current) {
            return false;
          }

          const items = flatItemsRef.current;
          if (items.length === 0) {
            return false;
          }

          setSelectedIndex((index) => (index + 1) % items.length);
          return true;
        },
        navigatePrev: () => {
          if (!triggerRef.current) {
            return false;
          }

          const items = flatItemsRef.current;
          if (items.length === 0) {
            return false;
          }

          setSelectedIndex(
            (index) => (index - 1 + items.length) % items.length,
          );
          return true;
        },
        confirmSelection: () => {
          if (!triggerRef.current) {
            return false;
          }

          const items = flatItemsRef.current;
          if (items.length === 0) {
            return false;
          }

          insertItem(items[selectedIndexRef.current]);
          return true;
        },
        dismiss: () => {
          if (!triggerRef.current) {
            return false;
          }

          controller.setState(null);
          return true;
        },
      },
    });

    return () => {
      controller.unbindUi();
    };
  }, [controller, flatItemsRef, insertItem, selectedIndexRef, triggerRef]);

  useEffect(() => {
    if (!view || !trigger) {
      return;
    }

    const updateCaretRect = () => {
      const coords = view.coordsAtPos(trigger.to);
      if (!coords) {
        setCaretRect(null);
        return;
      }

      setCaretRect({
        left: coords.left,
        top: coords.top,
        bottom: coords.bottom,
      });
    };

    updateCaretRect();
    view.scrollDOM.addEventListener("scroll", updateCaretRect, {
      passive: true,
    });
    window.addEventListener("scroll", updateCaretRect, true);
    window.addEventListener("resize", updateCaretRect);

    return () => {
      view.scrollDOM.removeEventListener("scroll", updateCaretRect);
      window.removeEventListener("scroll", updateCaretRect, true);
      window.removeEventListener("resize", updateCaretRect);
    };
  }, [trigger, view]);

  useEffect(() => {
    if (!trigger || flatItems.length === 0) {
      return;
    }

    const list = listBodyRef.current;
    if (!list) {
      return;
    }

    const selected = list.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]',
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [flatItems.length, safeSelectedIndex, trigger]);

  if (!trigger || !caretRect || typeof document === "undefined") {
    return null;
  }

  const placement = positionMentionPanel(caretRect);

  return createPortal(
    <div
      role="listbox"
      aria-label="Mention search"
      className="fixed z-50 overflow-hidden rounded-lg border border-white/10 bg-background text-foreground shadow-lg"
      style={placement.style}
    >
      <div className="border-b border-white/10 bg-white/[0.04] px-3 py-2">
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-background/80 px-2 py-1.5 font-mono text-sm text-foreground/80">
          <span className="text-foreground/50">@</span>
          <span className="min-w-0 flex-1 truncate">
            {trigger.query ||
              "Search tasks, projects, contacts, organizations, documents…"}
          </span>
        </div>
      </div>
      <div
        ref={listBodyRef}
        className="flex flex-col gap-0.5 overflow-y-auto p-1.5"
        style={{ maxHeight: placement.maxBodyHeight }}
      >
        {sections.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-foreground/50">
            No matches for{" "}
            <span className="font-mono">@{trigger.query || ""}</span>
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.kind} className="flex flex-col">
              <div className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-foreground/45">
                {section.heading}
              </div>
              {section.items.map((item) => {
                const itemIndex = flatItems.findIndex(
                  (entry) => mentionItemKey(entry) === mentionItemKey(item),
                );
                const isSelected = itemIndex === safeSelectedIndex;

                return (
                  <button
                    key={mentionItemKey(item)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertItem(item);
                    }}
                    onMouseEnter={() => {
                      if (itemIndex >= 0) {
                        setSelectedIndex(itemIndex);
                      }
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors ${
                      isSelected
                        ? "bg-white/10 text-foreground"
                        : "text-foreground/85 hover:bg-white/[0.06]"
                    }`}
                  >
                    <MentionLeadingIcon
                      kind={item.kind}
                      status={item.kind === "task" ? item.status : null}
                      projectIcon={
                        item.kind === "project" ? item.icon : null
                      }
                      documentIcon={
                        item.kind === "document" ? item.icon : null
                      }
                      contact={
                        item.kind === "contact"
                          ? {
                              id: item.id,
                              avatarStorageKey: item.avatarStorageKey,
                              avatarUpdatedAt: item.avatarUpdatedAt,
                            }
                          : null
                      }
                    />
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate font-medium">
                        {primaryLabel(item)}
                      </span>
                      {secondaryLabel(item) ? (
                        <span className="truncate text-xs text-foreground/45">
                          {secondaryLabel(item)}
                        </span>
                      ) : null}
                    </div>
                    {trailingHint(item) ? (
                      <span className="ml-2 shrink-0 font-mono text-[11px] text-foreground/45">
                        {trailingHint(item)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
