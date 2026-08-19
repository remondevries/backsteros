import { useEffect, useId, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import {
  turnFoldLabel,
  type AgentChatActivityItem,
} from "../../lib/agent/agent-chat-activity";
import {
  collectChangedFilesFromActivities,
  summarizeChangedFileStats,
} from "../../lib/agent/agent-chat-changed-files";
import type { AgentChatMessage } from "../../lib/agent/agent-chat-transcript";
import { colors } from "../../lib/theme";

/** Matches desktop `--desktop-agent-chat-*-fade: 2.5rem`. */
const EDGE_FADE_HEIGHT = 40;

/**
 * Overlay stop opacities inverted from desktop
 * `.desktop-agent-chat__transcript--top-fade` mask curve
 * (transparent → black), so text dissolves into the canvas.
 */
const TOP_FADE_STOPS = [
  { offset: "0%", opacity: 1 },
  { offset: "10%", opacity: 0.9 },
  { offset: "24%", opacity: 0.7 },
  { offset: "42%", opacity: 0.42 },
  { offset: "62%", opacity: 0.18 },
  { offset: "82%", opacity: 0.04 },
  { offset: "100%", opacity: 0 },
] as const;

const BOTTOM_FADE_STOPS = [
  { offset: "0%", opacity: 0 },
  { offset: "18%", opacity: 0.04 },
  { offset: "38%", opacity: 0.18 },
  { offset: "58%", opacity: 0.42 },
  { offset: "76%", opacity: 0.7 },
  { offset: "90%", opacity: 0.9 },
  { offset: "100%", opacity: 1 },
] as const;

type Props = {
  messages: readonly AgentChatMessage[];
  working?: boolean;
  emptyHint?: string;
  onOpenDiff?: () => void;
  /** Canvas color the transcript dissolves into (default shell black). */
  fadeColor?: string;
};

function TranscriptEdgeFade({
  edge,
  color,
}: {
  edge: "top" | "bottom";
  color: string;
}) {
  const reactId = useId().replace(/:/g, "");
  const gradientId = `agent-chat-${edge}-fade-${reactId}`;
  const [width, setWidth] = useState(0);
  const stops = edge === "top" ? TOP_FADE_STOPS : BOTTOM_FADE_STOPS;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.edgeFade,
        edge === "top" ? styles.edgeFadeTop : styles.edgeFadeBottom,
      ]}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0 && next !== width) setWidth(next);
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {width > 0 ? (
        <Svg width={width} height={EDGE_FADE_HEIGHT}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {stops.map((stop) => (
                <Stop
                  key={stop.offset}
                  offset={stop.offset}
                  stopColor={color}
                  stopOpacity={stop.opacity}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={width}
            height={EDGE_FADE_HEIGHT}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      ) : null}
    </View>
  );
}

function WorkingDots() {
  const a = useRef(new Animated.Value(0.35)).current;
  const b = useRef(new Animated.Value(0.35)).current;
  const c = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const make = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      );
    const anims = [make(a, 0), make(b, 200), make(c, 400)];
    for (const anim of anims) anim.start();
    return () => {
      for (const anim of anims) anim.stop();
    };
  }, [a, b, c]);

  return (
    <View style={styles.workingRow} accessibilityLabel="Working">
      <Animated.View style={[styles.workingDot, { opacity: a }]} />
      <Animated.View style={[styles.workingDot, { opacity: b }]} />
      <Animated.View style={[styles.workingDot, { opacity: c }]} />
    </View>
  );
}

function ActivityRow({ item }: { item: AgentChatActivityItem }) {
  return (
    <View style={styles.activityRow}>
      <Text style={styles.activityKind}>
        {item.kind === "thought"
          ? "···"
          : item.status === "failed"
            ? "!"
            : item.status === "completed"
              ? "✓"
              : "•"}
      </Text>
      <View style={styles.activityBody}>
        <Text style={styles.activityTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.detail ? (
          <Text style={styles.activityDetail} numberOfLines={2}>
            {item.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function AssistantTurn({
  message,
  isLatest,
  onOpenDiff,
}: {
  message: AgentChatMessage;
  isLatest: boolean;
  onOpenDiff?: () => void;
}) {
  const activities = message.activities ?? [];
  const changedFiles = collectChangedFilesFromActivities(activities);
  const stats = summarizeChangedFileStats(changedFiles);
  const fold = turnFoldLabel({
    outcome: message.turnOutcome,
    startedAt: message.workedStartedAt ?? message.turnStartedAt,
    endedAt: message.turnCompletedAt ?? message.createdAt,
    activityCount: activities.length,
  });
  const [expanded, setExpanded] = useState(isLatest && activities.length > 0);

  return (
    <View style={[styles.turn, styles.turnAssistant]}>
      {activities.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((value) => !value)}
          style={styles.foldRow}
        >
          <Text style={styles.foldLabel}>{fold}</Text>
          <Text style={styles.foldChevron}>{expanded ? "▾" : "▸"}</Text>
        </Pressable>
      ) : null}

      {expanded
        ? activities.map((item) => <ActivityRow key={item.id} item={item} />)
        : null}

      {message.text.trim() ? (
        <View style={styles.assistantTextWrap}>
          <Text style={styles.assistantText}>{message.text}</Text>
        </View>
      ) : null}

      {changedFiles.length > 0 && onOpenDiff ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${changedFiles.length} changed files`}
          onPress={onOpenDiff}
          style={styles.changedFiles}
        >
          <Text style={styles.changedFilesTitle}>
            {changedFiles.length} file
            {changedFiles.length === 1 ? "" : "s"} changed
          </Text>
          <Text style={styles.changedFilesStat}>
            {stats.additions > 0 ? (
              <Text style={styles.statAdd}>+{stats.additions}</Text>
            ) : null}
            {stats.additions > 0 && stats.deletions > 0 ? " " : null}
            {stats.deletions > 0 ? (
              <Text style={styles.statDel}>−{stats.deletions}</Text>
            ) : null}
          </Text>
        </Pressable>
      ) : null}

      {message.planSteps && message.planSteps.length > 0 ? (
        <View style={styles.planCard}>
          <Text style={styles.planTitle}>Plan</Text>
          {message.planSteps.map((step, index) => (
            <Text key={`${step.step}-${index}`} style={styles.planStep}>
              {step.status === "completed"
                ? "✓ "
                : step.status === "inProgress"
                  ? "… "
                  : "○ "}
              {step.step}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function AgentChatTranscript({
  messages,
  working = false,
  emptyHint = "Send a message to talk to the agent.",
  onOpenDiff,
  fadeColor = colors.background,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 16);
    return () => clearTimeout(timer);
  }, [messages.length, working]);

  return (
    <View style={styles.shell}>
      <ScrollView
        ref={scrollRef}
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="summary"
      >
        {messages.length === 0 && !working ? (
          <Text style={styles.empty}>{emptyHint}</Text>
        ) : null}
        <View style={styles.inner}>
          {messages.map((message, index) =>
            message.role === "user" ? (
              <View key={message.id} style={[styles.turn, styles.turnUser]}>
                <View style={[styles.bubble, styles.bubbleUser]}>
                  <Text style={styles.bubbleUserText}>{message.text}</Text>
                </View>
              </View>
            ) : (
              <AssistantTurn
                key={message.id}
                message={message}
                isLatest={index === messages.length - 1}
                onOpenDiff={onOpenDiff}
              />
            ),
          )}
          {working ? <WorkingDots /> : null}
        </View>
      </ScrollView>
      <TranscriptEdgeFade edge="top" color={fadeColor} />
      <TranscriptEdgeFade edge="bottom" color={fadeColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  root: {
    flex: 1,
  },
  edgeFade: {
    position: "absolute",
    left: 0,
    right: 0,
    height: EDGE_FADE_HEIGHT,
    zIndex: 1,
  },
  edgeFadeTop: {
    top: 0,
  },
  edgeFadeBottom: {
    bottom: 0,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
  inner: {
    gap: 14,
  },
  turn: {
    gap: 8,
    maxWidth: "100%",
  },
  turnUser: {
    alignItems: "flex-end",
  },
  turnAssistant: {
    alignItems: "stretch",
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    maxWidth: "80%",
  },
  bubbleUser: {
    backgroundColor: "#212121",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#343434",
  },
  bubbleUserText: {
    color: "#ededed",
    fontSize: 14,
    lineHeight: 22,
  },
  assistantTextWrap: {
    alignSelf: "stretch",
    maxWidth: "100%",
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  assistantText: {
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 22,
  },
  workingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  workingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.muted,
  },
  foldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 2,
  },
  foldLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  foldChevron: {
    color: colors.muted,
    fontSize: 12,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 2,
  },
  activityKind: {
    width: 14,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  activityBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  activityTitle: {
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 18,
  },
  activityDetail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  changedFiles: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  changedFilesTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  changedFilesStat: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  statAdd: {
    color: "#3f9d6e",
    fontWeight: "600",
  },
  statDel: {
    color: "#c45b5b",
    fontWeight: "600",
  },
  planCard: {
    alignSelf: "stretch",
    gap: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  planTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  planStep: {
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 18,
  },
});
