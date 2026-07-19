"use client";

import { useMemo, useRef, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { useContentPreviewLinkNavigation } from "@/components/shortcuts/use-content-preview-link-navigation";
import {
  useMentionCatalogOptional,
  useResolveMentionTokensInContent,
} from "@/hooks/use-mention-catalog";
import { EMPTY_MENTION_CATALOG } from "@/lib/documents/mentions/empty-catalog";
import { resolveMentionLayout } from "@/lib/documents/mentions/mention-layout";
import type { MentionCatalog } from "@/lib/documents/mentions/mention-menu-types";
import {
  extractMentionTokensFromMarkdown,
  type MentionSegment,
  segmentMarkdownWithMentions,
} from "@/lib/documents/mentions/tokens";

import { DocumentMentionChip } from "./document-mention-chip";

type DocumentMarkdownPreviewProps = {
  body: string;
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
    <p className="document-markdown-blank-line" aria-hidden="true">
      <br />
    </p>
  );
}

function InlineMarkdownText({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <>{children}</>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function InlineMarkdownSegment({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  if (hasBlockMarkdown(content)) {
    return <InlineMarkdownText content={content} />;
  }

  return <span className="whitespace-pre-wrap">{content}</span>;
}

function MarkdownBlockSegment({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  return <ReactMarkdown>{content}</ReactMarkdown>;
}

function renderMentionChip(
  segment: Extract<MentionSegment, { type: "mention" }>,
  segments: MentionSegment[],
  segmentIndex: number,
  mentionCatalog: MentionCatalog,
  key: string,
) {
  const layout = resolveMentionLayout(segments, segmentIndex);

  return (
    <DocumentMentionChip
      key={key}
      raw={segment.raw}
      catalog={mentionCatalog}
      layout={layout}
    />
  );
}

function renderInlineSegment(
  segment: MentionSegment,
  segments: MentionSegment[],
  segmentIndex: number,
  mentionCatalog: MentionCatalog,
  keyPrefix: string,
): ReactNode {
  if (segment.type === "mention") {
    return renderMentionChip(
      segment,
      segments,
      segmentIndex,
      mentionCatalog,
      `${keyPrefix}-mention-${segmentIndex}`,
    );
  }

  return (
    <InlineMarkdownSegment
      key={`${keyPrefix}-md-${segmentIndex}`}
      content={segment.content}
    />
  );
}

function isWhitespaceOnlyMarkdown(segment: MentionSegment): boolean {
  return segment.type === "markdown" && segment.content.trim() === "";
}

function renderParagraphWithMentions(
  segments: MentionSegment[],
  mentionCatalog: MentionCatalog,
  keyPrefix: string,
): ReactNode[] {
  const elements: ReactNode[] = [];
  let inlineRun: ReactNode[] = [];
  let inlineRunKey = 0;
  let blockGroup: ReactNode[] = [];
  let blockGroupKey = 0;

  function flushBlockGroup() {
    if (blockGroup.length === 0) {
      return;
    }

    elements.push(
      <div
        key={`${keyPrefix}-block-group-${blockGroupKey}`}
        className="mention-task-stack"
      >
        {blockGroup}
      </div>,
    );
    blockGroup = [];
    blockGroupKey += 1;
  }

  function flushInlineRun() {
    if (inlineRun.length === 0) {
      return;
    }

    elements.push(
      <p key={`${keyPrefix}-inline-${inlineRunKey}`}>{inlineRun}</p>,
    );
    inlineRun = [];
    inlineRunKey += 1;
  }

  segments.forEach((segment, index) => {
    if (isWhitespaceOnlyMarkdown(segment)) {
      // Keep soft newlines between mention chips so edit→preview line
      // breaks stay visible.
      if (segment.type === "markdown" && segment.content.includes("\n")) {
        inlineRun.push(
          <span
            key={`${keyPrefix}-ws-${index}`}
            className="whitespace-pre-wrap"
          >
            {segment.content}
          </span>,
        );
      }
      return;
    }

    if (
      segment.type === "mention" &&
      resolveMentionLayout(segments, index) === "block"
    ) {
      flushInlineRun();
      blockGroup.push(
        <div
          key={`${keyPrefix}-block-${index}`}
          className="mention-task-block"
        >
          {renderMentionChip(
            segment,
            segments,
            index,
            mentionCatalog,
            `${keyPrefix}-block-mention-${index}`,
          )}
        </div>,
      );
      return;
    }

    flushBlockGroup();
    inlineRun.push(
      renderInlineSegment(
        segment,
        segments,
        index,
        mentionCatalog,
        `${keyPrefix}-run-${index}`,
      ),
    );
  });

  flushBlockGroup();
  flushInlineRun();
  return elements;
}

function ParagraphPreview({
  paragraph,
  mentionCatalog,
  paragraphIndex,
}: {
  paragraph: string;
  mentionCatalog: MentionCatalog;
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
        <span className="whitespace-pre-wrap">{paragraph}</span>
      </p>
    );
  }

  if (!hasBlockMarkdown(paragraph)) {
    return (
      <>{renderParagraphWithMentions(segments, mentionCatalog, keyPrefix)}</>
    );
  }

  return (
    <div className="mention-paragraph-mixed">
      {renderParagraphWithMentions(segments, mentionCatalog, keyPrefix)}
    </div>
  );
}

export function DocumentMarkdownPreview({
  body,
  mentionCatalog: mentionCatalogProp,
}: DocumentMarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mentionCatalogFromContext = useMentionCatalogOptional()?.catalog;
  const mentionCatalog =
    mentionCatalogProp ?? mentionCatalogFromContext ?? EMPTY_MENTION_CATALOG;
  const enableMentions =
    mentionCatalogProp != null || mentionCatalogFromContext != null;

  const tokens = useMemo(
    () => (enableMentions ? extractMentionTokensFromMarkdown(body) : []),
    [body, enableMentions],
  );
  useResolveMentionTokensInContent(tokens);
  useContentPreviewLinkNavigation({ containerRef, body });

  if (!body.trim()) {
    return null;
  }

  const paragraphs = splitParagraphs(body);

  return (
    <div
      ref={containerRef}
      data-content-preview-links
      tabIndex={-1}
      className={
        enableMentions
          ? "document-markdown document-markdown-with-mentions"
          : "document-markdown"
      }
    >
      {paragraphs.map((paragraph, index) => (
        <ParagraphPreview
          key={`paragraph-${index}`}
          paragraph={paragraph}
          mentionCatalog={mentionCatalog}
          paragraphIndex={index}
        />
      ))}
    </div>
  );
}
