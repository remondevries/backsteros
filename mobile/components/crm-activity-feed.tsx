import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, spacing } from "../lib/theme";
import { TextInput } from "./app-text-input";
import {
  CalendarNavIcon,
  EmailNavIcon,
  LettersNavIcon,
  TasksNavIcon,
} from "./nav-icons";
import { ProjectOcticon } from "./project-octicon";
import { HeaderPlusGlyph } from "../lib/tab-stack-options";

export type CrmActivityTaskRelation = "assigned" | "related";

export type CrmActivityFeedItem = {
  id: string;
  kind: "note" | "meeting" | "task" | "letter";
  occurredAt: string;
  body?: string | null;
  bodyPreview?: string | null;
  meetingId?: string | null;
  meetingTitle?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  taskRelation?: CrmActivityTaskRelation | null;
  letterId?: string | null;
  letterTitle?: string | null;
};

export type CrmActivityCreateKind =
  | "task"
  | "note"
  | "email"
  | "meeting"
  | "letter";

type CreateMenuItem = {
  id: CrmActivityCreateKind;
  label: string;
};

const MARKER_SIZE = 36;
const GLYPH_SIZE = 16;
const EVENT_PAD = 10;
const RAIL_COLOR = "rgba(255, 255, 255, 0.12)";

const MARKER_COLORS: Record<string, { bg: string; fg: string }> = {
  note: { bg: "rgba(110, 168, 254, 0.22)", fg: "#6ea8fe" },
  meeting: { bg: "rgba(218, 97, 93, 0.22)", fg: "#da615d" },
  task: { bg: "rgba(63, 185, 80, 0.22)", fg: "#3fb950" },
  "task-assigned": { bg: "rgba(88, 166, 255, 0.22)", fg: "#58a6ff" },
  "task-related": { bg: "rgba(63, 185, 80, 0.22)", fg: "#3fb950" },
  letter: { bg: "rgba(242, 204, 96, 0.22)", fg: "#f2cc60" },
  add: { bg: "rgba(255, 255, 255, 0.08)", fg: "rgba(255, 255, 255, 0.55)" },
};

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const deltaSec = Math.round((Date.now() - then) / 1000);
  if (deltaSec < 45) return "just now";
  if (deltaSec < 3600) return `${Math.max(1, Math.round(deltaSec / 60))}m ago`;
  if (deltaSec < 86_400) return `${Math.round(deltaSec / 3600)}h ago`;
  if (deltaSec < 86_400 * 2) return "Yesterday";
  if (deltaSec < 86_400 * 7) return `${Math.round(deltaSec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(iso).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });
}

function markerToneKey(item: CrmActivityFeedItem): string {
  if (item.kind === "task" && item.taskRelation) {
    return `task-${item.taskRelation}`;
  }
  return item.kind;
}

function ActivityTypeIcon({
  kind,
  color,
}: {
  kind: CrmActivityFeedItem["kind"];
  color: string;
}) {
  if (kind === "meeting") {
    return <CalendarNavIcon color={color} size={GLYPH_SIZE} />;
  }
  if (kind === "task") {
    return <TasksNavIcon color={color} size={GLYPH_SIZE} />;
  }
  if (kind === "letter") {
    return <LettersNavIcon color={color} size={GLYPH_SIZE} />;
  }
  return <ProjectOcticon icon="note" size={GLYPH_SIZE} color={color} />;
}

function DetailLink({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  if (!onPress) {
    return <Text style={styles.detailStrong}>{label}</Text>;
  }
  return (
    <Text
      style={styles.detailStrong}
      onPress={onPress}
      accessibilityRole="link"
    >
      {label}
    </Text>
  );
}

function ActivityDetail({
  item,
  onOpenMeeting,
  onOpenTask,
  onOpenLetter,
}: {
  item: CrmActivityFeedItem;
  onOpenMeeting?: (meetingId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onOpenLetter?: (letterId: string) => void;
}): ReactNode {
  if (item.kind === "meeting") {
    const title = item.meetingTitle?.trim() || "Untitled meeting";
    return (
      <Text style={styles.detailText}>
        Meeting{" "}
        <DetailLink
          label={title}
          onPress={
            item.meetingId && onOpenMeeting
              ? () => onOpenMeeting(item.meetingId!)
              : undefined
          }
        />
      </Text>
    );
  }

  if (item.kind === "task") {
    const title = item.taskTitle?.trim() || "Untitled task";
    const relationLabel =
      item.taskRelation === "assigned"
        ? "Completed assigned task"
        : item.taskRelation === "related"
          ? "Completed related task"
          : "Completed task";
    return (
      <Text style={styles.detailText}>
        {relationLabel}{" "}
        <DetailLink
          label={title}
          onPress={
            item.taskId && onOpenTask
              ? () => onOpenTask(item.taskId!)
              : undefined
          }
        />
      </Text>
    );
  }

  if (item.kind === "letter") {
    const title = item.letterTitle?.trim() || "Untitled letter";
    return (
      <Text style={styles.detailText}>
        Letter{" "}
        <DetailLink
          label={title}
          onPress={
            item.letterId && onOpenLetter
              ? () => onOpenLetter(item.letterId!)
              : undefined
          }
        />{" "}
        received
      </Text>
    );
  }

  const body = item.body?.trim() || item.bodyPreview?.trim() || "";
  if (!body) {
    return <Text style={styles.detailText}>Note added</Text>;
  }
  return <Text style={styles.noteBody}>{body}</Text>;
}

function TimelineRail({
  isFirst,
  isLast,
  children,
}: {
  isFirst: boolean;
  isLast: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.leading}>
      {!isFirst ? <View style={styles.railTop} /> : null}
      {!isLast ? <View style={styles.railBottom} /> : null}
      {children}
    </View>
  );
}

export type CrmActivityFeedProps = {
  items: CrmActivityFeedItem[];
  loading?: boolean;
  error?: string | null;
  nextCursor?: string | null;
  onLoadMore?: () => void | Promise<void>;
  onSubmitNote?: (body: string) => void | Promise<void>;
  onCreateTask?: () => void;
  onCreateEmail?: () => void;
  onCreateMeeting?: () => void;
  onCreateLetter?: () => void;
  onOpenMeeting?: (meetingId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onOpenLetter?: (letterId: string) => void;
};

/**
 * Contact/org activity timeline — desktop `CrmActivityFeedView` chrome:
 * vertical rail, colored type markers, relative time above detail.
 */
export function CrmActivityFeed({
  items,
  loading = false,
  error = null,
  nextCursor = null,
  onLoadMore,
  onSubmitNote,
  onCreateTask,
  onCreateEmail,
  onCreateMeeting,
  onCreateLetter,
  onOpenMeeting,
  onOpenTask,
  onOpenLetter,
}: CrmActivityFeedProps) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const createItems = useMemo((): CreateMenuItem[] => {
    const next: CreateMenuItem[] = [];
    if (onCreateTask) next.push({ id: "task", label: "Task" });
    if (onSubmitNote) next.push({ id: "note", label: "Note" });
    if (onCreateEmail) next.push({ id: "email", label: "E-mail" });
    if (onCreateMeeting) next.push({ id: "meeting", label: "Meeting" });
    if (onCreateLetter) next.push({ id: "letter", label: "Letter" });
    return next;
  }, [
    onCreateEmail,
    onCreateLetter,
    onCreateMeeting,
    onCreateTask,
    onSubmitNote,
  ]);

  const canCreate = createItems.length > 0;
  const showAddRow = canCreate;
  const eventCount = items.length + (showAddRow ? 1 : 0);

  const closeComposer = useCallback(() => {
    setComposing(false);
    setDraft("");
  }, []);

  const handleCreateSelect = useCallback(
    (id: CrmActivityCreateKind) => {
      if (id === "note") {
        setComposing(true);
        return;
      }
      if (id === "task") onCreateTask?.();
      else if (id === "email") onCreateEmail?.();
      else if (id === "meeting") onCreateMeeting?.();
      else if (id === "letter") onCreateLetter?.();
    },
    [onCreateEmail, onCreateLetter, onCreateMeeting, onCreateTask],
  );

  const openCreateMenu = useCallback(() => {
    if (createItems.length === 0) return;
    const labels = createItems.map((item) => item.label);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...labels, "Cancel"],
          cancelButtonIndex: labels.length,
        },
        (buttonIndex) => {
          if (buttonIndex == null || buttonIndex >= createItems.length) return;
          handleCreateSelect(createItems[buttonIndex]!.id);
        },
      );
      return;
    }
    Alert.alert(
      "Add to activity",
      undefined,
      [
        ...createItems.map((item) => ({
          text: item.label,
          onPress: () => handleCreateSelect(item.id),
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  }, [createItems, handleCreateSelect]);

  async function handleSubmit() {
    const body = draft.trim();
    if (!body || !onSubmitNote || submitting) return;
    setSubmitting(true);
    try {
      await onSubmitNote(body);
      closeComposer();
    } finally {
      setSubmitting(false);
    }
  }

  const addTone = MARKER_COLORS.add!;

  return (
    <View style={styles.root}>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {loading && items.length === 0 && !canCreate ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.muted} />
          <Text style={styles.empty}>Loading activity…</Text>
        </View>
      ) : !loading && items.length === 0 && !canCreate ? (
        <Text style={styles.empty}>No activity yet.</Text>
      ) : (
        <View style={styles.timeline}>
          {showAddRow ? (
            <View style={styles.event}>
              <TimelineRail isFirst isLast={eventCount === 1}>
                {composing ? (
                  <View
                    style={[
                      styles.marker,
                      { backgroundColor: addTone.bg },
                    ]}
                    accessibilityElementsHidden
                  >
                    <HeaderPlusGlyph color={addTone.fg} size={16} />
                  </View>
                ) : (
                  <Pressable
                    onPress={openCreateMenu}
                    accessibilityRole="button"
                    accessibilityLabel="Add to activity"
                    style={({ pressed }) => [
                      styles.marker,
                      { backgroundColor: addTone.bg },
                      pressed ? { opacity: 0.85 } : null,
                    ]}
                  >
                    <HeaderPlusGlyph color={addTone.fg} size={16} />
                  </Pressable>
                )}
              </TimelineRail>
              <View style={styles.body}>
                {composing ? (
                  <View style={styles.composer}>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      placeholder="Add a note…"
                      placeholderTextColor={colors.muted}
                      multiline
                      autoFocus
                      style={styles.composerInput}
                    />
                    <View style={styles.composerActions}>
                      <Pressable
                        onPress={closeComposer}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel note"
                        style={styles.cancelButton}
                      >
                        <Text style={styles.cancelLabel}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleSubmit()}
                        disabled={!draft.trim() || submitting}
                        accessibilityRole="button"
                        accessibilityLabel="Post note"
                        style={({ pressed }) => [
                          styles.postButton,
                          (!draft.trim() || submitting) &&
                            styles.postButtonDisabled,
                          pressed && draft.trim() ? { opacity: 0.85 } : null,
                        ]}
                      >
                        <Text style={styles.postLabel}>
                          {submitting ? "…" : "Post"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : loading && items.length === 0 ? (
                  <Text style={styles.empty}>Loading activity…</Text>
                ) : items.length === 0 ? (
                  <Text style={styles.empty}>No activity yet.</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {items.map((item, index) => {
            const absoluteIndex = index + (showAddRow ? 1 : 0);
            const isFirst = absoluteIndex === 0;
            const isLast = absoluteIndex === eventCount - 1;
            const toneKey = markerToneKey(item);
            const tone = MARKER_COLORS[toneKey] ?? MARKER_COLORS.note!;

            return (
              <View key={item.id} style={styles.event}>
                <TimelineRail isFirst={isFirst} isLast={isLast}>
                  <View
                    style={[styles.marker, { backgroundColor: tone.bg }]}
                    accessibilityElementsHidden
                  >
                    <ActivityTypeIcon kind={item.kind} color={tone.fg} />
                  </View>
                </TimelineRail>
                <View style={styles.body}>
                  <Text
                    style={styles.when}
                    accessibilityLabel={new Date(
                      item.occurredAt,
                    ).toLocaleString()}
                  >
                    {formatRelativeTime(item.occurredAt)}
                  </Text>
                  <ActivityDetail
                    item={item}
                    onOpenMeeting={onOpenMeeting}
                    onOpenTask={onOpenTask}
                    onOpenLetter={onOpenLetter}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {nextCursor && onLoadMore ? (
        <Pressable
          onPress={() => void onLoadMore()}
          style={styles.loadMore}
          accessibilityRole="button"
        >
          <Text style={styles.loadMoreLabel}>Load more</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Menu icons for callers that build custom sheets (optional). */
export function crmActivityCreateIcon(
  kind: CrmActivityCreateKind,
  color = colors.foreground,
): ReactNode {
  if (kind === "task") return <TasksNavIcon color={color} size={16} />;
  if (kind === "email") return <EmailNavIcon color={color} size={16} />;
  if (kind === "meeting") return <CalendarNavIcon color={color} size={16} />;
  if (kind === "letter") return <LettersNavIcon color={color} size={16} />;
  return <ProjectOcticon icon="note" size={16} color={color} />;
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  timeline: {
    gap: 0,
  },
  event: {
    flexDirection: "row",
    alignItems: "flex-start",
    columnGap: 14,
    paddingVertical: EVENT_PAD,
  },
  leading: {
    width: MARKER_SIZE,
    alignItems: "center",
    alignSelf: "stretch",
    position: "relative",
  },
  railTop: {
    position: "absolute",
    top: -EVENT_PAD,
    bottom: "50%",
    width: StyleSheet.hairlineWidth,
    backgroundColor: RAIL_COLOR,
    left: MARKER_SIZE / 2 - StyleSheet.hairlineWidth / 2,
  },
  railBottom: {
    position: "absolute",
    top: "50%",
    bottom: -EVENT_PAD,
    width: StyleSheet.hairlineWidth,
    backgroundColor: RAIL_COLOR,
    left: MARKER_SIZE / 2 - StyleSheet.hairlineWidth / 2,
  },
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    // Opaque ring so the spine doesn't show through the circle.
    borderWidth: 3,
    borderColor: colors.background,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    justifyContent: "center",
    minHeight: MARKER_SIZE,
  },
  when: {
    color: "rgba(255, 255, 255, 0.48)",
    fontSize: 12,
    lineHeight: 16,
  },
  detailText: {
    color: "rgba(237, 237, 237, 0.78)",
    fontSize: 14,
    lineHeight: 20,
  },
  detailStrong: {
    color: colors.foreground,
    fontWeight: "600",
  },
  noteBody: {
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 20,
  },
  composer: {
    gap: 10,
    width: "100%",
  },
  composerInput: {
    color: colors.foreground,
    fontSize: 15,
    minHeight: 72,
    textAlignVertical: "top",
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  composerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
  postButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  postButtonDisabled: {
    opacity: 0.4,
  },
  postLabel: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: "600",
  },
  loadMore: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: spacing.screenX,
  },
  loadMoreLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
});
