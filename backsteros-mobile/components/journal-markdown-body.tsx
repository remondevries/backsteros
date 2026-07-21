import type { ReactNode } from "react";
import { Text, View } from "react-native";

import {
  projectDetailHref,
  taskDetailHref,
} from "../lib/detail-href";
import {
  resolveMentionChip,
  useMentionCatalogForBody,
  type MobileMentionCatalog,
} from "../lib/mention-catalog";
import {
  resolveMentionLayout,
  splitTrailingStructuralPrefix,
  type MentionChipLayout,
} from "../lib/mention-layout";
import {
  mentionTokenLabel,
  segmentMarkdownWithMentions,
  splitMarkdownParagraphs,
  type MentionSegment,
  type ParsedMentionToken,
} from "../lib/mention-tokens";
import { colors } from "../lib/theme";
import { MentionChip } from "./mention-chip";

type Props = {
  body: string;
};

function MentionSegmentView({
  token,
  catalog,
  layout,
}: {
  token: ParsedMentionToken;
  catalog: MobileMentionCatalog;
  layout: MentionChipLayout;
}) {
  const resolved = resolveMentionChip(token, catalog);

  const href =
    resolved.taskId && !resolved.deleted
      ? taskDetailHref(resolved.taskId)
      : resolved.projectId && !resolved.deleted
        ? projectDetailHref(resolved.projectId)
        : undefined;

  return (
    <MentionChip
      token={token}
      label={resolved.label || mentionTokenLabel(token)}
      deleted={resolved.deleted}
      status={resolved.status}
      displayId={
        token.kind === "task" || token.kind === "letter"
          ? token.displayId
          : token.kind === "project"
            ? token.key
            : null
      }
      href={href}
      layout={layout}
    />
  );
}

const BODY_FONT_SIZE = 15;
const BODY_LINE_HEIGHT = 22;

function BlankParagraph() {
  return (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        color: colors.foreground,
        fontSize: BODY_FONT_SIZE,
        lineHeight: BODY_LINE_HEIGHT,
      }}
    >
      {" "}
    </Text>
  );
}

function isWhitespaceOnlyMarkdown(segment: MentionSegment): boolean {
  return segment.type === "markdown" && segment.content.trim() === "";
}

function BlockMentionRow({
  prefix,
  children,
}: {
  prefix: string | null;
  children: ReactNode;
}) {
  const isUnordered = prefix != null && /^[ \t]*[-*+][ \t]+$/.test(prefix);
  const isOrdered = prefix != null && /^[ \t]*\d+\.[ \t]+$/.test(prefix);
  const isQuote = prefix != null && /^[ \t]*>[ \t]?$/.test(prefix);
  const orderedLabel = isOrdered ? prefix.trim() : null;

  return (
    <View
      style={{
        width: "100%",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        paddingLeft: isQuote ? 10 : 0,
        borderLeftWidth: isQuote ? 2 : 0,
        borderLeftColor: isQuote ? "rgba(255,255,255,0.15)" : "transparent",
      }}
    >
      {isUnordered ? (
        <Text
          style={{
            color: colors.muted,
            fontSize: BODY_FONT_SIZE,
            lineHeight: 34,
            width: 12,
          }}
        >
          •
        </Text>
      ) : null}
      {orderedLabel ? (
        <Text
          style={{
            color: colors.muted,
            fontSize: BODY_FONT_SIZE,
            lineHeight: 34,
            minWidth: 16,
          }}
        >
          {orderedLabel}
        </Text>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

function ParagraphWithMentions({
  paragraph,
  catalog,
}: {
  paragraph: string;
  catalog: MobileMentionCatalog;
}) {
  const segments = segmentMarkdownWithMentions(paragraph);
  const hasMentions = segments.some((segment) => segment.type === "mention");

  if (!hasMentions) {
    return (
      <Text
        style={{
          color: colors.foreground,
          fontSize: BODY_FONT_SIZE,
          lineHeight: BODY_LINE_HEIGHT,
        }}
      >
        {paragraph}
      </Text>
    );
  }

  const elements: ReactNode[] = [];
  let inlineRun: ReactNode[] = [];
  let inlineRunKey = 0;
  let blockGroup: ReactNode[] = [];
  let blockGroupKey = 0;
  let pendingStructuralPrefix: string | null = null;

  function flushBlockGroup() {
    if (blockGroup.length === 0) {
      return;
    }
    elements.push(
      <View
        key={`block-group-${blockGroupKey}`}
        style={{
          flexDirection: "column",
          gap: 6,
          marginBottom: 10,
          width: "100%",
        }}
      >
        {blockGroup}
      </View>,
    );
    blockGroup = [];
    blockGroupKey += 1;
  }

  function flushInlineRun() {
    if (inlineRun.length === 0) {
      return;
    }
    elements.push(
      <View
        key={`inline-${inlineRunKey}`}
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 2,
          rowGap: 6,
        }}
      >
        {inlineRun}
      </View>,
    );
    inlineRun = [];
    inlineRunKey += 1;
  }

  function pushMarkdownContent(content: string, index: number) {
    if (!content) {
      return;
    }
    if (content.trim() === "") {
      if (content.includes("\n")) {
        inlineRun.push(
          <Text
            key={`ws-head-${index}`}
            style={{
              color: colors.foreground,
              fontSize: BODY_FONT_SIZE,
              lineHeight: BODY_LINE_HEIGHT,
            }}
          >
            {content}
          </Text>,
        );
      }
      return;
    }
    flushBlockGroup();
    inlineRun.push(
      <Text
        key={`md-head-${index}`}
        style={{
          color: colors.foreground,
          fontSize: BODY_FONT_SIZE,
          lineHeight: BODY_LINE_HEIGHT,
        }}
      >
        {content}
      </Text>,
    );
  }

  segments.forEach((segment, index) => {
    if (segment.type === "markdown") {
      const next = segments[index + 1];
      const nextIsBlockMention =
        next?.type === "mention" &&
        resolveMentionLayout(segments, index + 1) === "block";

      if (nextIsBlockMention) {
        const split = splitTrailingStructuralPrefix(segment.content);
        if (split) {
          pushMarkdownContent(split.head, index);
          pendingStructuralPrefix = split.prefix;
          return;
        }
      }

      if (isWhitespaceOnlyMarkdown(segment)) {
        if (segment.content.includes("\n")) {
          inlineRun.push(
            <Text
              key={`ws-${index}`}
              style={{
                color: colors.foreground,
                fontSize: BODY_FONT_SIZE,
                lineHeight: BODY_LINE_HEIGHT,
              }}
            >
              {segment.content}
            </Text>,
          );
        }
        return;
      }

      flushBlockGroup();
      pendingStructuralPrefix = null;
      inlineRun.push(
        <SegmentView
          key={`${segment.type}-${index}`}
          segment={segment}
          segments={segments}
          segmentIndex={index}
          catalog={catalog}
        />,
      );
      return;
    }

    if (resolveMentionLayout(segments, index) === "block") {
      flushInlineRun();
      const prefix = pendingStructuralPrefix;
      pendingStructuralPrefix = null;
      blockGroup.push(
        <BlockMentionRow key={`block-${index}`} prefix={prefix}>
          <MentionSegmentView
            token={segment.token}
            catalog={catalog}
            layout="block"
          />
        </BlockMentionRow>,
      );
      return;
    }

    flushBlockGroup();
    pendingStructuralPrefix = null;
    inlineRun.push(
      <SegmentView
        key={`${segment.type}-${index}`}
        segment={segment}
        segments={segments}
        segmentIndex={index}
        catalog={catalog}
      />,
    );
  });

  flushBlockGroup();
  flushInlineRun();

  return <View style={{ gap: 0 }}>{elements}</View>;
}

function SegmentView({
  segment,
  segments,
  segmentIndex,
  catalog,
}: {
  segment: MentionSegment;
  segments: MentionSegment[];
  segmentIndex: number;
  catalog: MobileMentionCatalog;
}) {
  if (segment.type === "mention") {
    return (
      <MentionSegmentView
        token={segment.token}
        catalog={catalog}
        layout={resolveMentionLayout(segments, segmentIndex)}
      />
    );
  }

  if (!segment.content) return null;

  return (
    <Text
      style={{
        color: colors.foreground,
        fontSize: BODY_FONT_SIZE,
        lineHeight: BODY_LINE_HEIGHT,
      }}
    >
      {segment.content}
    </Text>
  );
}

/** Journal body with desktop-style `[@task:…]` / `[@project:…]` chips. */
export function JournalMarkdownBody({ body }: Props) {
  const catalog = useMentionCatalogForBody(body);
  const paragraphs = splitMarkdownParagraphs(body);

  return (
    <View>
      {paragraphs.map((paragraph, index) =>
        paragraph.trim() === "" ? (
          <BlankParagraph key={`blank-${index}`} />
        ) : (
          <ParagraphWithMentions
            key={`p-${index}`}
            paragraph={paragraph}
            catalog={catalog}
          />
        ),
      )}
    </View>
  );
}
