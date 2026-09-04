import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useMemo,
  useRef,
} from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import {
  projectDetailHref,
  taskDetailHref,
} from "../lib/detail-href";
import {
  classifyMarkdownBlock,
  parseInlineMarkdown,
  type InlineNode,
  type MarkdownTable,
  type TableAlignment,
  splitMarkdownContentParts,
} from "../lib/markdown-inline";
import { parseMarkdownTaskCheckbox } from "../lib/markdown-task-list";
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

type TaskListInteractContextValue = {
  allocateIndex: () => number;
  onToggle?: (index: number) => void;
};

const TaskListInteractContext =
  createContext<TaskListInteractContextValue | null>(null);

function TaskCheckbox({ checked }: { checked: boolean }) {
  const ctx = useContext(TaskListInteractContext);
  const indexRef = useRef<number | null>(null);
  if (indexRef.current === null) {
    indexRef.current = ctx?.allocateIndex() ?? -1;
  }
  const index = indexRef.current;
  const interactive = Boolean(ctx?.onToggle) && index >= 0;

  const box = (
    <View
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={
        interactive ? "yes" : "no-hide-descendants"
      }
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

  if (!interactive) return box;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={checked ? "Mark incomplete" : "Mark complete"}
      hitSlop={8}
      onPress={() => ctx?.onToggle?.(index)}
    >
      {box}
    </Pressable>
  );
}

type Props = {
  body: string;
  /** When set, GFM task-list checkboxes are tappable and call with 0-based index. */
  onToggleTaskCheckbox?: (index: number) => void;
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

const bodyTextStyle: TextStyle = {
  color: colors.foreground,
  fontSize: BODY_FONT_SIZE,
  lineHeight: BODY_LINE_HEIGHT,
};

function headingTextStyle(level: number): TextStyle {
  const size =
    level <= 1 ? 24 : level === 2 ? 20 : level === 3 ? 17 : BODY_FONT_SIZE;
  return {
    color: colors.foreground,
    fontSize: size,
    lineHeight: Math.round(size * 1.3),
    fontWeight: "600",
  };
}

function renderInlineNodes(
  nodes: InlineNode[],
  keyPrefix: string,
  baseStyle: TextStyle,
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") {
      return (
        <Text key={key} style={baseStyle}>
          {node.value}
        </Text>
      );
    }
    if (node.type === "code") {
      return (
        <Text
          key={key}
          style={{
            ...baseStyle,
            fontFamily: "monospace",
            backgroundColor: colors.faint,
            color: colors.foreground,
          }}
        >
          {node.value}
        </Text>
      );
    }
    if (node.type === "strong") {
      return (
        <Text key={key} style={{ ...baseStyle, fontWeight: "700" }}>
          {renderInlineNodes(node.children, key, {
            ...baseStyle,
            fontWeight: "700",
          })}
        </Text>
      );
    }
    if (node.type === "em") {
      return (
        <Text key={key} style={{ ...baseStyle, fontStyle: "italic" }}>
          {renderInlineNodes(node.children, key, {
            ...baseStyle,
            fontStyle: "italic",
          })}
        </Text>
      );
    }
    if (node.type === "del") {
      return (
        <Text
          key={key}
          style={{
            ...baseStyle,
            textDecorationLine: "line-through",
            color: colors.muted,
          }}
        >
          {renderInlineNodes(node.children, key, {
            ...baseStyle,
            textDecorationLine: "line-through",
            color: colors.muted,
          })}
        </Text>
      );
    }
    return (
      <Text
        key={key}
        style={{
          ...baseStyle,
          color: colors.accent,
          textDecorationLine: "underline",
        }}
        onPress={() => {
          void Linking.openURL(node.href).catch(() => {
            /* ignore invalid URLs */
          });
        }}
        accessibilityRole="link"
      >
        {renderInlineNodes(node.children, key, {
          ...baseStyle,
          color: colors.accent,
          textDecorationLine: "underline",
        })}
      </Text>
    );
  });
}

/** Render markdown inline formatting inside a single Text tree. */
function InlineMarkdownText({
  text,
  style,
}: {
  text: string;
  style?: TextStyle;
}) {
  const base = { ...bodyTextStyle, ...style };
  return (
    <Text style={base}>
      {renderInlineNodes(parseInlineMarkdown(text), "in", base)}
    </Text>
  );
}

function alignmentStyle(align: TableAlignment | undefined): TextStyle {
  if (align === "center") return { textAlign: "center" };
  if (align === "right") return { textAlign: "right" };
  return { textAlign: "left" };
}

function MarkdownTableView({ table }: { table: MarkdownTable }) {
  const columnCount = Math.max(1, table.headers.length);

  const renderRow = (cells: string[], rowKey: string, header: boolean) => (
    <View
      key={rowKey}
      style={{
        flexDirection: "row",
        width: "100%",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        backgroundColor: header ? colors.faint : "transparent",
      }}
    >
      {cells.map((cell, index) => (
        <View
          key={`${rowKey}-c${index}`}
          style={{
            flex: 1,
            minWidth: 0,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRightWidth: index < columnCount - 1 ? StyleSheet.hairlineWidth : 0,
            borderRightColor: colors.border,
            justifyContent: "center",
          }}
        >
          <InlineMarkdownText
            text={cell || " "}
            style={{
              ...alignmentStyle(table.alignments[index]),
              fontWeight: header ? "600" : "400",
              fontSize: 13,
              lineHeight: 18,
            }}
          />
        </View>
      ))}
    </View>
  );

  return (
    <View
      style={{
        width: "100%",
        marginVertical: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: colors.surface,
      }}
      accessibilityRole="summary"
      accessibilityLabel="Table"
    >
      {renderRow(table.headers, "header", true)}
      {table.rows.map((row, index) => renderRow(row, `row-${index}`, false))}
    </View>
  );
}

function MarkdownBlockText({ text }: { text: string }) {
  const parts = splitMarkdownContentParts(text);
  if (parts.length === 1 && parts[0]?.type === "text") {
    return <MarkdownPlainBlock text={parts[0].text} />;
  }

  return (
    <View style={{ width: "100%", gap: 6 }}>
      {parts.map((part, index) =>
        part.type === "table" ? (
          <MarkdownTableView key={`table-${index}`} table={part.table} />
        ) : (
          <MarkdownPlainBlock key={`text-${index}`} text={part.text} />
        ),
      )}
    </View>
  );
}

function MarkdownPlainBlock({ text }: { text: string }) {
  const block = classifyMarkdownBlock(text);
  if (block.kind === "table") {
    return <MarkdownTableView table={block.table} />;
  }
  if (block.kind === "hr") {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginVertical: 10,
          width: "100%",
        }}
      />
    );
  }
  if (block.kind === "heading") {
    return (
      <InlineMarkdownText
        text={block.text}
        style={headingTextStyle(block.level)}
      />
    );
  }
  if (block.kind === "blockquote") {
    return (
      <View
        style={{
          borderLeftWidth: 3,
          borderLeftColor: colors.border,
          paddingLeft: 10,
          width: "100%",
        }}
      >
        <InlineMarkdownText text={block.text} style={{ color: colors.muted }} />
      </View>
    );
  }
  return <InlineMarkdownText text={block.text} />;
}

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

  const checkbox = parseMarkdownTaskCheckbox(opener.textAfterMarker);
  const textAfterMarker = checkbox?.textAfter ?? opener.textAfterMarker;

  const children: ReactNode[] = [];
  if (checkbox) {
    children.push(
      <TaskCheckbox key={`li-check-${startIndex}`} checked={checkbox.checked} />,
    );
  }
  if (textAfterMarker) {
    children.push(
      <InlineMarkdownText
        key={`li-text-${startIndex}`}
        text={textAfterMarker}
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
        <InlineMarkdownText
          key={`li-md-${index}`}
          text={segment.content}
        />,
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
    // Skip list/code special-casing inside an opening fence line.
    const inFence = /^[ \t]*(```|~~~)/.test(paragraph);
    if (!inFence) {
      const lines = paragraph.split("\n");
      let fenceOpen = false;
      const hasListLine = lines.some((line) => {
        if (/^[ \t]*(```|~~~)/.test(line)) {
          fenceOpen = !fenceOpen;
          return false;
        }
        if (fenceOpen) return false;
        if (/^`.*`$/.test(line.trim())) return false;
        return Boolean(matchListItemOpener(line));
      });
      if (hasListLine) {
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
              if (opener) {
                const checkbox = !opener.ordered
                  ? parseMarkdownTaskCheckbox(opener.textAfterMarker)
                  : null;
                const itemText = checkbox
                  ? checkbox.textAfter
                  : opener.textAfterMarker;
                const markerLabel = opener.ordered
                  ? `${(line.match(/(\d+)\./)?.[1] ?? "1")}.`
                  : checkbox
                    ? null
                    : "•";
                return (
                  <View
                    key={`plain-li-${lineIndex}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      width: "100%",
                      columnGap: 6,
                    }}
                  >
                    {checkbox ? (
                      <TaskCheckbox checked={checkbox.checked} />
                    ) : markerLabel ? (
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
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <InlineMarkdownText text={itemText} />
                    </View>
                  </View>
                );
              }
              return (
                <MarkdownBlockText key={`plain-line-${lineIndex}`} text={line} />
              );
            })}
          </View>
        );
      }
    }

    return <MarkdownBlockText text={paragraph} />;
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

  return <MarkdownBlockText text={segment.content} />;
}

/** Journal body with desktop-style `[@task:…]` / `[@project:…]` chips. */
export function JournalMarkdownBody({
  body,
  onToggleTaskCheckbox,
}: Props) {
  const catalog = useMentionCatalogForBody(body);
  const paragraphs = splitMarkdownParagraphs(body);
  const indexRef = useRef(0);
  indexRef.current = 0;
  const interact = useMemo<TaskListInteractContextValue>(
    () => ({
      allocateIndex: () => {
        const next = indexRef.current;
        indexRef.current += 1;
        return next;
      },
      onToggle: onToggleTaskCheckbox,
    }),
    [onToggleTaskCheckbox],
  );

  return (
    <TaskListInteractContext.Provider value={interact}>
      <View key={body}>
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
    </TaskListInteractContext.Provider>
  );
}
