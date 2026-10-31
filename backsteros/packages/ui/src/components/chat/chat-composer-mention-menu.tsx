"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useMentionCatalogOptional } from "../../mentions/mention-catalog-context.js";
import type {
  MentionCatalog,
  MentionItem,
  MentionSection,
} from "../../mentions/mention-menu-types.js";
import {
  buildMentionSections,
  flattenMentionSections,
} from "../../mentions/search-catalog.js";
import { preferredContactMentionDisplayId } from "../../mentions/tokens.js";
import { MentionLeadingIcon } from "../mentions/mention-leading-icon.js";
import { EMPTY_MENTION_CATALOG } from "../../mentions/empty-catalog.js";

function primaryLabel(item: MentionItem): string {
  switch (item.kind) {
    case "task":
    case "letter":
    case "email":
    case "document":
    case "meeting":
    case "journal":
    case "habit":
    case "message":
    case "post":
    case "transaction":
    case "invoice":
    case "estimate":
      return item.title;
    case "project":
    case "contact":
    case "organization":
      return item.name;
  }
}

function secondaryLabel(item: MentionItem): string | null {
  switch (item.kind) {
    case "task":
    case "letter":
    case "email":
    case "meeting":
      return item.projectName;
    case "project":
    case "organization":
      return null;
    case "contact":
      return item.organizationName ?? item.title;
    case "document":
      return `${item.projectKey}/${item.relativePath}`;
    case "journal":
      return item.date;
    case "habit":
      return item.date;
    case "message":
      return item.contactName ?? item.channelType;
    case "post":
      return item.platform;
    case "transaction":
      return item.currency != null && item.amountCents != null
        ? `${(item.amountCents / 100).toFixed(2)} ${item.currency}`
        : null;
    case "invoice":
      return item.invoiceNumber;
    case "estimate":
      return item.displayId;
  }
}

function trailingHint(item: MentionItem): string | null {
  if (
    item.kind === "task" ||
    item.kind === "letter" ||
    item.kind === "email" ||
    item.kind === "meeting"
  ) {
    return item.displayId;
  }
  if (item.kind === "contact") {
    return preferredContactMentionDisplayId(item) ?? item.key;
  }
  if (item.kind === "project" || item.kind === "organization") {
    return item.key;
  }
  if (item.kind === "journal") return item.date;
  if (item.kind === "habit" && item.date) return item.date;
  if (item.kind === "message") return item.channelType;
  if (item.kind === "post") return item.platform;
  return null;
}

function mentionItemKey(item: MentionItem): string {
  return `${item.kind}:${item.id}`;
}

export type ChatComposerMentionMenuProps = {
  query: string;
  highlight: number;
  onHighlightChange: (index: number) => void;
  onSelect: (item: MentionItem) => void;
  catalog?: MentionCatalog | null;
};

/**
 * In-composer @ mention popup (same catalog/search as document editors),
 * positioned above the composer like the `/` slash menu.
 */
export function ChatComposerMentionMenu({
  query,
  highlight,
  onHighlightChange,
  onSelect,
  catalog: catalogProp = null,
}: ChatComposerMentionMenuProps) {
  const mentionCatalogApi = useMentionCatalogOptional();
  const catalog =
    catalogProp ?? mentionCatalogApi?.catalog ?? EMPTY_MENTION_CATALOG;
  const searchSections = mentionCatalogApi?.searchSections;
  const [remoteResult, setRemoteResult] = useState<{
    query: string;
    sections: MentionSection[];
  } | null>(null);
  const listBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchSections) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void searchSections(query).then((sections) => {
        if (!cancelled) setRemoteResult({ query, sections });
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, searchSections]);

  const sections = useMemo(() => {
    if (remoteResult?.query === query) return remoteResult.sections;
    return buildMentionSections(catalog, query);
  }, [catalog, query, remoteResult]);
  const flatItems = useMemo(
    () => flattenMentionSections(sections),
    [sections],
  );
  const safeHighlight =
    flatItems.length === 0
      ? 0
      : Math.min(highlight, flatItems.length - 1);

  useEffect(() => {
    const selected = listBodyRef.current?.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]',
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [flatItems.length, safeHighlight]);

  return (
    <div
      className="chat-ui-composer__slash-menu chat-ui-composer__mention-menu"
      role="listbox"
      aria-label="Mention search"
    >
      <div className="chat-ui-composer__slash-section-label">
        {query
          ? `Mentions matching “${query}”`
          : "Mention a task, project, contact…"}
      </div>
      <div ref={listBodyRef} className="chat-ui-composer__mention-menu-body">
        {sections.length === 0 ? (
          <div className="chat-ui-composer__mention-empty">
            No matches for @{query || ""}
          </div>
        ) : (
          sections.map((section) => (
            <div
              key={section.kind}
              className="chat-ui-composer__slash-section"
              role="group"
              aria-label={section.heading}
            >
              <div className="chat-ui-composer__slash-section-label">
                {section.heading}
              </div>
              {section.items.map((item) => {
                const itemIndex = flatItems.findIndex(
                  (entry) => mentionItemKey(entry) === mentionItemKey(item),
                );
                const isSelected = itemIndex === safeHighlight;
                return (
                  <button
                    key={mentionItemKey(item)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={[
                      "chat-ui-composer__slash-option",
                      isSelected ? "is-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelect(item);
                    }}
                    onMouseEnter={() => {
                      if (itemIndex >= 0) onHighlightChange(itemIndex);
                    }}
                  >
                    <MentionLeadingIcon
                      kind={item.kind}
                      status={
                        item.kind === "task" ||
                        item.kind === "email" ||
                        item.kind === "project"
                          ? item.status
                          : null
                      }
                      projectIcon={
                        item.kind === "project" ? item.icon : null
                      }
                      projectType={
                        item.kind === "project" ? item.type : null
                      }
                      documentIcon={
                        item.kind === "document" ? item.icon : null
                      }
                      channelType={
                        item.kind === "message" ? item.channelType : null
                      }
                      contactName={
                        item.kind === "message" ? item.contactName : null
                      }
                      contact={
                        item.kind === "contact"
                          ? {
                              id: item.id,
                              avatarSrc: item.avatarSrc,
                              avatarStorageKey: item.avatarStorageKey,
                              avatarUpdatedAt: item.avatarUpdatedAt,
                            }
                          : null
                      }
                      organization={
                        item.kind === "organization"
                          ? {
                              id: item.id,
                              avatarSrc: item.avatarSrc,
                            }
                          : null
                      }
                    />
                    <span className="chat-ui-composer__slash-option-copy">
                      <span className="chat-ui-composer__slash-option-name">
                        {primaryLabel(item)}
                      </span>
                      {secondaryLabel(item) ? (
                        <span className="chat-ui-composer__slash-option-cmd">
                          {secondaryLabel(item)}
                        </span>
                      ) : null}
                    </span>
                    {trailingHint(item) ? (
                      <span className="chat-ui-composer__mention-hint">
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
    </div>
  );
}

export function chatComposerMentionFlatItems(
  catalog: MentionCatalog,
  query: string,
): MentionItem[] {
  return flattenMentionSections(buildMentionSections(catalog, query));
}
