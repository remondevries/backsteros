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

  segments.forEach((segment, index) => {
    if (isWhitespaceOnlyMarkdown(segment)) {
      if (segment.type === "markdown" && segment.content.includes("\n")) {
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

    if (
      segment.type === "mention" &&
      resolveMentionLayout(segments, index) === "block"
    ) {
      flushInlineRun();
      blockGroup.push(
        <View key={`block-${index}`} style={{ width: "100%" }}>
          <MentionSegmentView
            token={segment.token}
            catalog={catalog}
            layout="block"
          />
        </View>,
      );
      return;
    }

    flushBlockGroup();
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
