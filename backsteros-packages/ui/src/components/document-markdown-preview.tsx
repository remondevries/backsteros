"use client";

import { useMemo, useRef, type ReactNode } from "react";
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
  resolveMentionCatalogLetter,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogProject,
  resolveMentionCatalogTask,
} from "../mentions/resolve-catalog-entry.js";
import type { MentionCatalog } from "../mentions/mention-menu-types.js";
import { resolveMentionHref } from "../mentions/tokens.js";
import {
  mentionTokenLabel,
  segmentMarkdownWithMentions,
  type MentionSegment,
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

const inlineMarkdownComponents: Components = {
  ...markdownPreviewComponents,
  p: ({ children }) => <>{children}</>,
};

export type DocumentMarkdownPreviewProps = {
  body: string;
  /** Override catalog; defaults to MentionCatalogProvider. */
  mentionCatalog?: MentionCatalog;
};

function hasBlockMarkdown(content: string): boolean {
  return /^(\s*#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|```|>\s|\|.+\|)/m.test(
    content,
  );
}

/**
 * Split on blank-line runs while keeping empty rows visible in preview.
 * N consecutive newlines (N >= 2) become N - 1 blank paragraphs — matching
 * the empty lines the user sees in the editor.
 */
function splitParagraphs(body: string): string[] {
  if (!body) {
    return [];
  }

  const parts: string[] = [];
  const blankLineRuns = /\n{2,}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blankLineRuns.exec(body)) !== null) {
    parts.push(body.slice(lastIndex, match.index));
    const blankLineCount = match[0].length - 1;
    for (let i = 0; i < blankLineCount; i += 1) {
      parts.push("");
    }
    lastIndex = match.index + match[0].length;
  }

  const rest = body.slice(lastIndex);
  if (rest.length > 0 || parts.length === 0) {
    parts.push(rest);
  }

  return parts;
}

function BlankParagraph() {
  return (
    <p className="content-markdown-preview-blank-line" aria-hidden="true">
      <br />
    </p>
  );
}

function InlineMarkdownText({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  return (
    <ReactMarkdown components={inlineMarkdownComponents}>{content}</ReactMarkdown>
  );
}

function InlineMarkdownSegment({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  if (hasBlockMarkdown(content)) {
    return <InlineMarkdownText content={content} />;
  }

  return (
    <span className="content-markdown-preview-prewrap">{content}</span>
  );
}

function MarkdownBlockSegment({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  return (
    <ReactMarkdown components={markdownPreviewComponents}>{content}</ReactMarkdown>
  );
}

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
    case "letter": {
      const letter = resolveMentionCatalogLetter(token, catalog);
      if (!letter) {
        return { label: mentionTokenLabel(token), deleted: true };
      }
      return { label: letter.title || letter.displayId, deleted: false };
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
    case "letter":
      return {
        kind: "letter" as const,
        status: null,
        projectIcon: null,
        documentIcon: null,
        contact: null,
      };
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

function renderInlineSegment(
  segment: MentionSegment,
  catalog: MentionCatalog,
  key: string,
): ReactNode {
  if (segment.type === "mention") {
    return (
      <MentionChipLite key={key} token={segment.token} catalog={catalog} />
    );
  }

  return <InlineMarkdownSegment key={key} content={segment.content} />;
}

function isWhitespaceOnlyMarkdown(segment: MentionSegment): boolean {
  return segment.type === "markdown" && segment.content.trim() === "";
}

function renderParagraphWithMentions(
  segments: MentionSegment[],
  catalog: MentionCatalog,
  keyPrefix: string,
): ReactNode {
  const inlineRun: ReactNode[] = [];

  segments.forEach((segment, index) => {
    if (isWhitespaceOnlyMarkdown(segment)) {
      // Keep soft newlines between mention chips (Next skips these; we
      // preserve them so edit→preview line breaks stay visible).
      if (segment.type === "markdown" && segment.content.includes("\n")) {
        inlineRun.push(
          <span
            key={`${keyPrefix}-ws-${index}`}
            className="content-markdown-preview-prewrap"
          >
            {segment.content}
          </span>,
        );
      }
      return;
    }

    inlineRun.push(
      renderInlineSegment(segment, catalog, `${keyPrefix}-seg-${index}`),
    );
  });

  if (inlineRun.length === 0) {
    return null;
  }

  return <p key={`${keyPrefix}-inline`}>{inlineRun}</p>;
}

function ParagraphPreview({
  paragraph,
  catalog,
  paragraphIndex,
}: {
  paragraph: string;
  catalog: MentionCatalog;
  paragraphIndex: number;
}) {
  const keyPrefix = `p-${paragraphIndex}`;

  if (paragraph.trim() === "") {
    return <BlankParagraph />;
  }

  const segments = segmentMarkdownWithMentions(paragraph);
  const hasMentions = segments.some((segment) => segment.type === "mention");

  if (!hasMentions) {
    if (hasBlockMarkdown(paragraph)) {
      return <MarkdownBlockSegment content={paragraph} />;
    }

    return (
      <p>
        <span className="content-markdown-preview-prewrap">{paragraph}</span>
      </p>
    );
  }

  if (!hasBlockMarkdown(paragraph)) {
    return <>{renderParagraphWithMentions(segments, catalog, keyPrefix)}</>;
  }

  return (
    <div className="content-markdown-preview-mixed">
      {renderParagraphWithMentions(segments, catalog, keyPrefix)}
    </div>
  );
}

/**
 * Rendered markdown preview with mention chips and catalog-backed hover cards.
 * Soft line breaks and blank paragraphs match Next `DocumentMarkdownPreview`.
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

  const paragraphs = splitParagraphs(body);

  return (
    <div
      ref={containerRef}
      data-content-preview-links=""
      tabIndex={-1}
      className="content-markdown-preview-body content-markdown-preview-body--rendered"
    >
      {paragraphs.map((paragraph, index) => (
        <ParagraphPreview
          key={`paragraph-${index}`}
          paragraph={paragraph}
          catalog={catalog}
          paragraphIndex={index}
        />
      ))}
    </div>
  );
}
