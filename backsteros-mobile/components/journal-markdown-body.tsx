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
  matchListItemOpener,
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

function parseTaskCheckbox(textAfterMarker: string): {
  checked: boolean;
  textAfter: string;
} | null {
  // `` `[ ]` `` / `` `[x]` `` — documenting syntax, not a real checkbox.
  if (/^`+\[[ xX]?\]`/.test(textAfterMarker)) {
    return null;
  }
  const match = textAfterMarker.match(/^\[([ xX]?)\](?:[ \t]+|(?=$))(.*)$/);
  if (!match) return null;
  const mark = match[1] ?? "";
  return {
    checked: mark === "x" || mark === "X",
    textAfter: match[2] ?? "",
  };
}

function TaskCheckbox({ checked }: { checked: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 14,
        height: 14,
        marginTop: 3,
        marginRight: 6,
        borderRadius: 3,
        borderWidth: 1.5,
        borderColor: checked
          ? "rgba(103, 162, 90, 0.85)"
          : "rgba(255, 255, 255, 0.45)",
        backgroundColor: checked
          ? "rgba(103, 162, 90, 0.55)"
          : "rgba(0, 0, 0, 0.25)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked ? (
        <Text style={{ color: "#f4faf2", fontSize: 10, lineHeight: 11 }}>✓</Text>
      ) : null}
    </View>
  );
}

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

function consumeListItem(
  segments: MentionSegment[],
  startIndex: number,
  catalog: MobileMentionCatalog,
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

  const checkbox = parseTaskCheckbox(opener.textAfterMarker);
  const textAfterMarker = checkbox?.textAfter ?? opener.textAfterMarker;

  const children: ReactNode[] = [];
  if (checkbox) {
    children.push(
      <TaskCheckbox key={`li-check-${startIndex}`} checked={checkbox.checked} />,
    );
  }
  if (textAfterMarker) {
    children.push(
      <Text
        key={`li-text-${startIndex}`}
        style={{
          color: colors.foreground,
          fontSize: BODY_FONT_SIZE,
          lineHeight: BODY_LINE_HEIGHT,
        }}
      >
        {textAfterMarker}
      </Text>,
    );
  }

  let index = startIndex + 1;
  while (index < segments.length) {
    const segment = segments[index];
    if (!segment) {
      break;
    }

    if (segment.type === "mention") {
      children.push(
        <MentionSegmentView
          key={`li-mention-${index}`}
          token={segment.token}
          catalog={catalog}
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
      children.push(
        <Text
          key={`li-md-${index}`}
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
    index += 1;
  }

  if (children.length === 0) {
    return null;
  }

  const markerLabel = opener.ordered
    ? `${(start.content.match(/(\d+)\./)?.[1] ?? "1")}.`
    : checkbox
      ? null
      : "•";

  return {
    leadingNewlines: opener.leadingNewlines,
    ordered: opener.ordered,
    item: (
      <View
        key={`li-${startIndex}`}
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "flex-start",
          columnGap: 6,
          rowGap: 4,
          width: "100%",
          paddingLeft: 2,
        }}
      >
        {markerLabel ? (
          <Text
            style={{
              color: colors.muted,
              fontSize: BODY_FONT_SIZE,
              lineHeight: BODY_LINE_HEIGHT,
              minWidth: opener.ordered ? 18 : 14,
            }}
          >
            {markerLabel}
          </Text>
        ) : null}
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "flex-start",
            columnGap: 2,
            rowGap: 4,
            minWidth: 0,
          }}
        >
          {children}
        </View>
      </View>
    ),
    nextIndex: index,
  };
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
    // Skip checkbox rendering inside fenced code or fully backtick-wrapped lines.
    const inFence = /^[ \t]*(```|~~~)/.test(paragraph);
    if (!inFence) {
      const lines = paragraph.split("\n");
      let fenceOpen = false;
      const taskLines = lines.map((line) => {
        if (/^[ \t]*(```|~~~)/.test(line)) {
          fenceOpen = !fenceOpen;
          return null;
        }
        if (fenceOpen) return null;
        if (/^`.*`$/.test(line.trim())) return null;
        const opener = matchListItemOpener(line);
        if (!opener || opener.ordered) return null;
        return parseTaskCheckbox(opener.textAfterMarker);
      });
      if (taskLines.some(Boolean)) {
        fenceOpen = false;
        return (
          <View style={{ width: "100%", gap: 4 }}>
            {lines.map((line, lineIndex) => {
              if (/^[ \t]*(```|~~~)/.test(line)) {
                fenceOpen = !fenceOpen;
                return (
                  <Text
                    key={`plain-fence-${lineIndex}`}
                    style={{
                      color: colors.muted,
                      fontSize: BODY_FONT_SIZE,
                      lineHeight: BODY_LINE_HEIGHT,
                      fontFamily: "monospace",
                    }}
                  >
                    {line}
                  </Text>
                );
              }
              if (fenceOpen || /^`.*`$/.test(line.trim())) {
                return (
                  <Text
                    key={`plain-code-${lineIndex}`}
                    style={{
                      color: colors.foreground,
                      fontSize: BODY_FONT_SIZE,
                      lineHeight: BODY_LINE_HEIGHT,
                      fontFamily: "monospace",
                    }}
                  >
                    {line}
                  </Text>
                );
              }
              const opener = matchListItemOpener(line);
              const checkbox =
                opener && !opener.ordered
                  ? parseTaskCheckbox(opener.textAfterMarker)
                  : null;
              if (checkbox) {
                return (
                  <View
                    key={`plain-li-${lineIndex}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      width: "100%",
                    }}
                  >
                    <TaskCheckbox checked={checkbox.checked} />
                    <Text
                      style={{
                        flex: 1,
                        color: colors.foreground,
                        fontSize: BODY_FONT_SIZE,
                        lineHeight: BODY_LINE_HEIGHT,
                      }}
                    >
                      {checkbox.textAfter}
                    </Text>
                  </View>
                );
              }
              return (
                <Text
                  key={`plain-line-${lineIndex}`}
                  style={{
                    color: colors.foreground,
                    fontSize: BODY_FONT_SIZE,
                    lineHeight: BODY_LINE_HEIGHT,
                  }}
                >
                  {line}
                </Text>
              );
            })}
          </View>
        );
      }
    }

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
  let index = 0;

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

  while (index < segments.length) {
    const listItems: ReactNode[] = [];
    let listStart = index;

    while (index < segments.length) {
      const consumed = consumeListItem(segments, index, catalog);
      if (!consumed) {
        break;
      }

      if (consumed.leadingNewlines) {
        if (listItems.length > 0) {
          break;
        }
        flushBlockGroup();
        inlineRun.push(
          <Text
            key={`ws-list-${index}`}
            style={{
              color: colors.foreground,
              fontSize: BODY_FONT_SIZE,
              lineHeight: BODY_LINE_HEIGHT,
            }}
          >
            {consumed.leadingNewlines}
          </Text>,
        );
      }

      listItems.push(consumed.item);
      index = consumed.nextIndex;
    }

    if (listItems.length > 0) {
      flushInlineRun();
      flushBlockGroup();
      elements.push(
        <View
          key={`list-${listStart}`}
          style={{
            flexDirection: "column",
            gap: 6,
            marginBottom: 10,
            width: "100%",
            paddingLeft: 8,
          }}
        >
          {listItems}
        </View>,
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
      index += 1;
      continue;
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
      index += 1;
      continue;
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
    index += 1;
  }

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
