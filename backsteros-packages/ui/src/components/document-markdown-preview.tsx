"use client";

import { useMemo, useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

import { ClientLink } from "../client-link.js";
import { isInternalAppHref } from "../is-internal-app-href.js";
import {
  useMentionCatalogOptional,
  useResolveMentionTokensInContent,
} from "../mentions/mention-catalog-context.js";
import { useMentionNavigationPathname } from "../mentions/mention-navigation-context.js";
import { EMPTY_MENTION_CATALOG } from "../mentions/empty-catalog.js";
import {
  resolveMentionCatalogContact,
  resolveMentionCatalogDocument,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogProject,
  resolveMentionCatalogTask,
} from "../mentions/resolve-catalog-entry.js";
import type { MentionCatalog } from "../mentions/mention-menu-types.js";
import { resolveMentionHref } from "../mentions/tokens.js";
import {
  mentionTokenLabel,
  segmentMarkdownWithMentions,
  type ParsedMentionToken,
} from "../mention-tokens.js";
import { resolveMentionTrailHref } from "../navigation-trail/mention-trail.js";
import { useContentPreviewLinkNavigation } from "../use-content-preview-link-navigation.js";
import { DocumentMentionHoverCard } from "./document-mention-hover-card.js";
import { MentionChipHoverShell } from "./mention-chip-hover-shell.js";
import { MentionLeadingIcon } from "./mention-leading-icon.js";

const markdownPreviewComponents: Components = {
  a({ href, children }) {
    if (!href) {
      return <span>{children}</span>;
    }
    if (isInternalAppHref(href)) {
      return (
        <ClientLink href={href} className="content-markdown-preview-link">
          {children}
        </ClientLink>
      );
    }
    return (
      <a
        href={href}
        className="content-markdown-preview-link"
        target="_blank"
        rel="noreferrer noopener"
      >
        {children}
      </a>
    );
  },
};

export type DocumentMarkdownPreviewProps = {
  body: string;
  /** Override catalog; defaults to MentionCatalogProvider. */
  mentionCatalog?: MentionCatalog;
};

function resolvePreviewChipLabel(
  token: ParsedMentionToken,
  catalog: MentionCatalog,
): { label: string; deleted: boolean } {
  switch (token.kind) {
    case "task": {
      const task = resolveMentionCatalogTask(token, catalog);
      if (!task) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: task.title || task.displayId, deleted: false };
    }
    case "project": {
      const project = resolveMentionCatalogProject(token, catalog);
      if (!project) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: project.name, deleted: false };
    }
    case "contact": {
      const contact = resolveMentionCatalogContact(token, catalog);
      if (!contact) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: contact.name, deleted: false };
    }
    case "organization": {
      const organization = resolveMentionCatalogOrganization(token, catalog);
      if (!organization) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: organization.name, deleted: false };
    }
    case "document": {
      const document = resolveMentionCatalogDocument(token, catalog);
      if (!document) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: document.title, deleted: false };
    }
  }
}

function resolvePreviewChipIconProps(
  token: ParsedMentionToken,
  catalog: MentionCatalog,
) {
  switch (token.kind) {
    case "task": {
      const task = resolveMentionCatalogTask(token, catalog);
      return {
        kind: "task" as const,
        status: task?.status ?? null,
        projectIcon: null,
        documentIcon: null,
        contact: null,
      };
    }
    case "project": {
      const project = resolveMentionCatalogProject(token, catalog);
      return {
        kind: "project" as const,
        status: null,
        projectIcon: project?.icon ?? null,
        documentIcon: null,
        contact: null,
      };
    }
    case "contact": {
      const contact = resolveMentionCatalogContact(token, catalog);
      return {
        kind: "contact" as const,
        status: null,
        projectIcon: null,
        documentIcon: null,
        contact: contact
          ? {
              id: contact.id,
              avatarStorageKey: contact.avatarStorageKey,
              avatarUpdatedAt: contact.avatarUpdatedAt,
            }
          : null,
      };
    }
    case "organization":
      return {
        kind: "organization" as const,
        status: null,
        projectIcon: null,
        documentIcon: null,
        contact: null,
      };
    case "document": {
      const document = resolveMentionCatalogDocument(token, catalog);
      return {
        kind: "document" as const,
        status: null,
        projectIcon: null,
        documentIcon: document?.icon ?? null,
        contact: null,
      };
    }
  }
}

function MentionChipLite({
  token,
  catalog,
}: {
  token: ParsedMentionToken;
  catalog: MentionCatalog;
}) {
  const { label, deleted } = resolvePreviewChipLabel(token, catalog);
  const iconProps = resolvePreviewChipIconProps(token, catalog);
  const trailSourceHref = useMentionNavigationPathname();
  const href = deleted
    ? null
    : (trailSourceHref
        ? resolveMentionTrailHref(token, catalog, trailSourceHref)
        : null) ?? resolveMentionHref(token, catalog);

  const chipClassName = [
    "mention-chip-lite",
    `mention-chip-lite--${token.kind}`,
    deleted ? "mention-chip-lite--deleted" : "",
    href ? "mention-chip-lite--link" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const chipBody = (
    <>
      <span className="mention-chip-lite__icon" aria-hidden="true">
        <MentionLeadingIcon
          kind={iconProps.kind}
          status={iconProps.status}
          projectIcon={iconProps.projectIcon}
          documentIcon={iconProps.documentIcon}
          contact={iconProps.contact}
        />
      </span>
      <span className="mention-chip-lite__label">{label}</span>
    </>
  );

  const trigger = href ? (
    <ClientLink href={href} className={chipClassName} title={token.raw}>
      {chipBody}
    </ClientLink>
  ) : (
    <span className={chipClassName} title={token.raw}>
      {chipBody}
    </span>
  );

  return (
    <MentionChipHoverShell
      trigger={trigger}
      asChild={Boolean(href)}
      hoverContent={
        <DocumentMentionHoverCard parsed={token} catalog={catalog} />
      }
    />
  );
}

/**
 * Rendered markdown preview with mention chips and catalog-backed hover cards.
 */
export function DocumentMarkdownPreview({
  body,
  mentionCatalog,
}: DocumentMarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const catalogFromContext = useMentionCatalogOptional()?.catalog;
  const catalog =
    mentionCatalog ?? catalogFromContext ?? EMPTY_MENTION_CATALOG;

  const segments = useMemo(
    () => segmentMarkdownWithMentions(body),
    [body],
  );
  const mentionTokens = useMemo(
    () =>
      segments.flatMap((segment) =>
        segment.type === "mention" ? [segment.token] : [],
      ),
    [segments],
  );
  useResolveMentionTokensInContent(mentionTokens);

  useContentPreviewLinkNavigation({ containerRef, body });

  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      data-content-preview-links=""
      tabIndex={-1}
      className="content-markdown-preview-body content-markdown-preview-body--rendered"
    >
      {segments.map((segment, index) => {
        if (segment.type === "mention") {
          return (
            <MentionChipLite
              key={`mention-${index}-${segment.raw}`}
              token={segment.token}
              catalog={catalog}
            />
          );
        }

        if (!segment.content.trim()) {
          return null;
        }

        return (
          <ReactMarkdown
            key={`md-${index}`}
            components={markdownPreviewComponents}
          >
            {segment.content}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}
