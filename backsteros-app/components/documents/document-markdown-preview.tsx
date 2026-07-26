"use client";

import {
  Children,
  isValidElement,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getTaskListItemChecked,
  MarkdownTaskCheckbox,
  MarkdownTaskListInteractProvider,
  normalizeMarkdownTaskLists,
  parseMarkdownTaskCheckbox,
} from "@backsteros/ui";

import { useContentPreviewLinkNavigation } from "@/components/shortcuts/use-content-preview-link-navigation";
import {
  useMentionCatalogOptional,
  useResolveMentionTokensInContent,
} from "@/hooks/use-mention-catalog";
import { EMPTY_MENTION_CATALOG } from "@/lib/documents/mentions/empty-catalog";
import { matchListItemOpener, resolveMentionLayout } from "@/lib/documents/mentions/mention-layout";
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
  /**
   * When set, task-list checkboxes are clickable and update this markdown body.
   */
  onChange?: (nextBody: string) => void;
};

function hasBlockMarkdown(content: string): boolean {
  return /^(\s*#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|```|>\s|\|.+\|)/m.test(
    content,
  );
}

/** Inclusive ranges of fenced code blocks so blank lines inside stay intact. */
function findFencedCodeRanges(body: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let fence: { start: number; char: string; len: number } | null = null;
  let offset = 0;
  for (const line of body.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    if (!fence) {
      const open = line.match(/^([ \t]*)(`{3,}|~{3,})/);
      if (open) {
        fence = {
          start: lineStart,
          char: open[2]![0]!,
          len: open[2]!.length,
        };
      }
    } else {
      const close = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
      if (
        close &&
        close[1]!.startsWith(fence.char) &&
        close[1]!.length >= fence.len
      ) {
        ranges.push([fence.start, lineEnd]);
        fence = null;
      }
    }
    offset = lineEnd + 1;
  }
  if (fence) {
    ranges.push([fence.start, body.length]);
  }
  return ranges;
}

/**
 * Split on blank-line runs while keeping empty rows visible in preview.
 * N consecutive newlines (N >= 2) become N - 1 blank paragraphs — matching
 * the empty lines the user sees in the editor.
 * Blank lines inside fenced code are preserved so `- [ ]` examples stay literal.
 */
function splitParagraphs(body: string): string[] {
  if (!body) {
    return [];
  }

  const fenceRanges = findFencedCodeRanges(body);
  const parts: string[] = [];
  const blankLineRuns = /\n{2,}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blankLineRuns.exec(body)) !== null) {
    if (
      fenceRanges.some(
        ([start, end]) => match!.index >= start && match!.index < end,
      )
    ) {
      continue;
    }
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

const markdownRemarkPlugins = [remarkGfm];

const markdownPreviewComponents: Components = {
  li(props) {
    const { children, className, ...rest } = props;
    const checked = getTaskListItemChecked(props);
    const isTaskItem =
      typeof checked === "boolean" ||
      (typeof className === "string" && className.includes("task-list-item"));
    if (!isTaskItem) {
      return (
        <li className={className} {...rest}>
          {children}
        </li>
      );
    }
    const body = Children.toArray(children).filter((child) => {
      if (!isValidElement(child)) return true;
      return child.type !== "input";
    });
    const isChecked = checked === true;
    return (
      <li
        className={[className, "task-list-item"].filter(Boolean).join(" ")}
        data-checked={isChecked ? "true" : "false"}
        {...rest}
      >
        <MarkdownTaskCheckbox checked={isChecked} />
        <span className="md-task-checkbox__content">{body}</span>
      </li>
    );
  },
  input(props) {
    if (props.type === "checkbox") {
      return null;
    }
    return <input {...props} />;
  },
};

const inlineMarkdownComponents: Components = {
  ...markdownPreviewComponents,
  p({ children }) {
    return <span className="whitespace-pre-wrap">{children}</span>;
  },
};

function InlineMarkdownSegment({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  // Inline markdown so backtick code spans stay literal (no checkbox conversion).
  return (
    <ReactMarkdown
      remarkPlugins={markdownRemarkPlugins}
      components={inlineMarkdownComponents}
    >
      {normalizeMarkdownTaskLists(content)}
    </ReactMarkdown>
  );
}

function MarkdownBlockSegment({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  return (
    <ReactMarkdown
      remarkPlugins={markdownRemarkPlugins}
      components={markdownPreviewComponents}
    >
      {normalizeMarkdownTaskLists(content)}
    </ReactMarkdown>
  );
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

/**
 * Consume one markdown list item (marker + same-line text/mentions) so chips
 * stay inline inside the `<li>` instead of breaking out after a ReactMarkdown list.
 */
function consumeListItem(
  segments: MentionSegment[],
  startIndex: number,
  mentionCatalog: MentionCatalog,
  keyPrefix: string,
): {
  leadingNewlines: string;
  ordered: boolean;
  item: ReactNode;
  nextIndex: number;
} | null {
  const start = segments[startIndex];
  if (start?.type !== "markdown") {
    return null;
  }

  const opener = matchListItemOpener(start.content);
  if (!opener) {
    return null;
  }

  const checkbox = parseMarkdownTaskCheckbox(opener.textAfterMarker);
  const textAfterMarker = checkbox?.textAfter ?? opener.textAfterMarker;

  const children: ReactNode[] = [];
  if (checkbox) {
    children.push(
      <MarkdownTaskCheckbox
        key={`${keyPrefix}-li-check-${startIndex}`}
        checked={checkbox.checked}
      />,
    );
  }

  const contentChildren: ReactNode[] = [];
  if (textAfterMarker) {
    contentChildren.push(
      <InlineMarkdownSegment
        key={`${keyPrefix}-li-text-${startIndex}`}
        content={textAfterMarker}
      />,
    );
  }

  let index = startIndex + 1;
  while (index < segments.length) {
    const segment = segments[index];
    if (!segment) {
      break;
    }

    if (segment.type === "mention") {
      contentChildren.push(
        <DocumentMentionChip
          key={`${keyPrefix}-li-mention-${index}`}
          raw={segment.raw}
          catalog={mentionCatalog}
          layout="inline"
        />,
      );
      index += 1;
      continue;
    }

    if (segment.content.startsWith("\n")) {
      break;
    }

    if (segment.content) {
      contentChildren.push(
        <span
          key={`${keyPrefix}-li-md-${index}`}
          className="whitespace-pre-wrap"
        >
          {segment.content}
        </span>,
      );
    }
    index += 1;
  }

  if (contentChildren.length > 0) {
    children.push(
      checkbox ? (
        <span
          key={`${keyPrefix}-li-content-${startIndex}`}
          className="md-task-checkbox__content"
        >
          {contentChildren}
        </span>
      ) : (
        contentChildren
      ),
    );
  }

  if (children.length === 0) {
    return null;
  }

  return {
    leadingNewlines: opener.leadingNewlines,
    ordered: opener.ordered,
    item: (
      <li
        key={`${keyPrefix}-li-${startIndex}`}
        className={checkbox ? "task-list-item" : undefined}
        data-checked={
          checkbox ? (checkbox.checked ? "true" : "false") : undefined
        }
      >
        {children}
      </li>
    ),
    nextIndex: index,
  };
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
  let index = 0;

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

  while (index < segments.length) {
    const listItems: ReactNode[] = [];
    let listOrdered: boolean | null = null;
    let listStart = index;

    while (index < segments.length) {
      const consumed = consumeListItem(
        segments,
        index,
        mentionCatalog,
        keyPrefix,
      );
      if (!consumed) {
        break;
      }

      if (consumed.leadingNewlines) {
        if (listItems.length > 0) {
          break;
        }
        flushBlockGroup();
        inlineRun.push(
          <span
            key={`${keyPrefix}-ws-list-${index}`}
            className="whitespace-pre-wrap"
          >
            {consumed.leadingNewlines}
          </span>,
        );
      }

      if (listOrdered == null) {
        listOrdered = consumed.ordered;
      } else if (listOrdered !== consumed.ordered) {
        break;
      }

      listItems.push(consumed.item);
      index = consumed.nextIndex;
    }

    if (listItems.length > 0) {
      flushInlineRun();
      flushBlockGroup();
      const ListTag = listOrdered ? "ol" : "ul";
      elements.push(
        <ListTag
          key={`${keyPrefix}-list-${listStart}`}
          className="mention-structured-list mention-structured-list--inline"
        >
          {listItems}
        </ListTag>,
      );
      continue;
    }

    const segment = segments[index];
    if (!segment) {
      break;
    }

    if (isWhitespaceOnlyMarkdown(segment)) {
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
      index += 1;
      continue;
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
      index += 1;
      continue;
    }

    flushBlockGroup();

    // Headings/lists/code must not land inside the inline <p> run — that
    // produces invalid <p><h2>… nesting and hydration errors.
    if (segment.type === "markdown" && hasBlockMarkdown(segment.content)) {
      flushInlineRun();
      elements.push(
        <MarkdownBlockSegment
          key={`${keyPrefix}-block-md-${index}`}
          content={segment.content}
        />,
      );
      index += 1;
      continue;
    }

    inlineRun.push(
      renderInlineSegment(
        segment,
        segments,
        index,
        mentionCatalog,
        `${keyPrefix}-run-${index}`,
      ),
    );
    index += 1;
  }

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
  onChange,
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
    <MarkdownTaskListInteractProvider body={body} onChange={onChange}>
      <div
        ref={containerRef}
        data-content-preview-links
        data-markdown-task-list-root=""
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
    </MarkdownTaskListInteractProvider>
  );
}
