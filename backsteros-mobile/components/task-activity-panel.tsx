import type { TaskActivity, TaskComment } from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { isAgentHoldCommentBody } from "../lib/agent-hold-comment";
import {
  coalescePropertyActivities,
  formatActivityMessage,
  formatRelativeTime,
  groupConsecutiveAgentWorked,
  isAgentComment,
  normalizeEmail,
  VISIBLE_ACTIVITY_LIMIT,
} from "../lib/task-activity-format";
import {
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../lib/task-status";
import { colors, spacing } from "../lib/theme";
import { AgentActivityIcon } from "./agent-activity-icon";
import { TextInput } from "./app-text-input";
import { ContactPersonIcon } from "./contact-person-icon";
import { TasksNavIcon } from "./nav-icons";
import { ProjectIcon } from "./project-icon";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";

export type TaskActivityRequestJson = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export type TaskActivityCurrentUser = {
  email: string | null;
  imageUrl: string | null;
};

export type TaskActivityPanelProps = {
  taskId: string;
  /** Bump reload when the parent task changes (e.g. status patch). */
  taskUpdatedAt?: string | number | null;
  feedRevision?: number;
  requestJson: TaskActivityRequestJson;
  currentUser: TaskActivityCurrentUser;
};

const ACTIVITY_MARKER_SIZE = 16;
const ACTIVITY_GLYPH_SIZE = 12;
const COMMENT_AVATAR_SIZE = 16;

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function asTaskStatus(value: unknown): TaskStatus | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if ((TASK_STATUS_ORDER as readonly string[]).includes(value)) {
    return value as TaskStatus;
  }
  return migrateLegacyTaskStatus(value);
}

function ActivityLeadingIcon({ activity }: { activity: TaskActivity }) {
  let glyph: ReactNode = <View style={styles.glyphFallback} />;

  if (activity.type === "status_changed") {
    const status = asTaskStatus(activity.data.to);
    if (status) {
      glyph = <TaskStatusIcon status={status} size={ACTIVITY_GLYPH_SIZE} />;
    }
  } else if (activity.type === "priority_changed") {
    const priority =
      typeof activity.data.to === "number" ? activity.data.to : 0;
    glyph = <TaskPriorityIcon priority={priority} size={ACTIVITY_GLYPH_SIZE} />;
  } else if (activity.type === "due_date_changed") {
    glyph = (
      <TaskDueDateIcon
        active={activity.data.to != null}
        size={ACTIVITY_GLYPH_SIZE}
      />
    );
  } else if (activity.type === "assignee_changed") {
    glyph = (
      <ContactPersonIcon size={ACTIVITY_GLYPH_SIZE} color={colors.muted} />
    );
  } else if (activity.type === "agent_worked") {
    glyph = (
      <AgentActivityIcon size={ACTIVITY_GLYPH_SIZE} color={colors.muted} />
    );
  } else if (activity.type === "created") {
    glyph = <TasksNavIcon color={colors.muted} size={ACTIVITY_GLYPH_SIZE} />;
  } else if (activity.type === "project_changed") {
    glyph = <ProjectIcon size={ACTIVITY_GLYPH_SIZE} color={colors.muted} />;
  }

  return (
    <View style={styles.eventMarker} accessibilityElementsHidden>
      {glyph}
    </View>
  );
}

function CommentAvatar({
  name,
  src,
  isAgent,
}: {
  name: string;
  src: string | null;
  isAgent: boolean;
}) {
  if (isAgent) {
    return (
      <View style={[styles.avatar, styles.avatarFallback]}>
        <AgentActivityIcon
          size={COMMENT_AVATAR_SIZE}
          color="rgba(237, 237, 237, 0.7)"
        />
      </View>
    );
  }
  if (src) {
    return <Image source={{ uri: src }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitials}>{authorInitials(name)}</Text>
    </View>
  );
}

function resolveCommentAvatarSrc(
  comment: Pick<TaskComment, "authorUserId" | "authorEmail">,
  currentUser: { email: string | null; imageUrl: string | null },
): string | null {
  if (comment.authorUserId == null) return null;
  const email = normalizeEmail(comment.authorEmail);
  if (!email) return null;
  if (currentUser.email && email === currentUser.email) {
    return currentUser.imageUrl;
  }
  return null;
}

export function TaskActivityPanel({
  taskId,
  taskUpdatedAt,
  feedRevision = 0,
  requestJson,
  currentUser,
}: TaskActivityPanelProps) {
  const currentUserAvatar = useMemo(
    () => ({
      email: normalizeEmail(currentUser.email),
      imageUrl: currentUser.imageUrl?.trim() || null,
    }),
    [currentUser.email, currentUser.imageUrl],
  );

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [draft, setDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [loadingFeed, setLoadingFeed] = useState(true);
  const hasLoadedFeedRef = useRef(false);
  const [posting, setPosting] = useState(false);
  const [postingReplyTo, setPostingReplyTo] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [expandedResolvedIds, setExpandedResolvedIds] = useState<
    Record<string, true>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
  const [expandedAgentGroups, setExpandedAgentGroups] = useState<
    Record<string, true>
  >({});

  useEffect(() => {
    hasLoadedFeedRef.current = false;
    setLoadingFeed(true);
    setActivitiesExpanded(false);
    setExpandedAgentGroups({});
    setReplyDrafts({});
    setDraft("");
    setEditingCommentId(null);
    setEditDraft("");
    setExpandedResolvedIds({});
  }, [taskId]);

  const loadFeed = useCallback(async () => {
    const isInitialLoad = !hasLoadedFeedRef.current;
    if (isInitialLoad) {
      setLoadingFeed(true);
    }
    setError(null);
    try {
      const [commentsResult, activitiesResult] = await Promise.all([
        requestJson<{ comments: TaskComment[] }>(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
        ),
        requestJson<{ activities: TaskActivity[] }>(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
        ),
      ]);
      setComments(commentsResult.comments ?? []);
      setActivities(activitiesResult.activities ?? []);
      hasLoadedFeedRef.current = true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load activity.",
      );
      if (isInitialLoad) {
        setComments([]);
        setActivities([]);
      }
    } finally {
      setLoadingFeed(false);
    }
  }, [requestJson, taskId]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed, taskUpdatedAt, feedRevision]);

  const activityTimeline = useMemo(() => {
    const chronological = [...activities].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    const items = groupConsecutiveAgentWorked(
      coalescePropertyActivities(chronological),
    ).map((entry) => ({
      id: entry.activity.id,
      at: entry.at,
      activity: entry.activity,
      count: entry.count,
      children: entry.children,
    }));
    items.sort((a, b) => b.at.localeCompare(a.at));
    return items;
  }, [activities]);

  const { visibleActivities, hiddenActivityCount } = useMemo(() => {
    const hidden = Math.max(0, activityTimeline.length - VISIBLE_ACTIVITY_LIMIT);
    if (activitiesExpanded || hidden === 0) {
      return {
        visibleActivities: activityTimeline,
        hiddenActivityCount: hidden,
      };
    }
    return {
      visibleActivities: activityTimeline.slice(0, VISIBLE_ACTIVITY_LIMIT),
      hiddenActivityCount: hidden,
    };
  }, [activitiesExpanded, activityTimeline]);

  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [comments],
  );

  const rootComments = useMemo(
    () =>
      sortedComments
        .filter((comment) => comment.parentCommentId == null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sortedComments],
  );

  const repliesByParentId = useMemo(() => {
    const map = new Map<string, TaskComment[]>();
    for (const comment of sortedComments) {
      if (!comment.parentCommentId) continue;
      const list = map.get(comment.parentCommentId) ?? [];
      list.push(comment);
      map.set(comment.parentCommentId, list);
    }
    return map;
  }, [sortedComments]);

  const postComment = useCallback(
    async (
      bodyRaw: string,
      parentCommentId?: string | null,
    ): Promise<boolean> => {
      const body = bodyRaw.trim();
      if (!body) return false;
      if (parentCommentId) {
        if (postingReplyTo) return false;
        setPostingReplyTo(parentCommentId);
      } else {
        if (posting) return false;
        setPosting(true);
      }
      setError(null);
      try {
        const created = await requestJson<TaskComment>(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              body,
              parentCommentId: parentCommentId ?? null,
            }),
          },
        );
        setComments((current) => [...current, created]);
        if (parentCommentId) {
          setReplyDrafts((current) => ({
            ...current,
            [parentCommentId]: "",
          }));
        } else {
          setDraft("");
        }
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not post comment.",
        );
        return false;
      } finally {
        if (parentCommentId) {
          setPostingReplyTo(null);
        } else {
          setPosting(false);
        }
      }
    },
    [posting, postingReplyTo, requestJson, taskId],
  );

  const patchComment = useCallback(
    async (
      commentId: string,
      patch: { body?: string; resolvedAt?: string | null },
    ) => {
      setSavingCommentId(commentId);
      setError(null);
      try {
        const updated = await requestJson<TaskComment>(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        setComments((current) =>
          current.map((comment) =>
            comment.id === commentId ? updated : comment,
          ),
        );
        return updated;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not update comment.",
        );
        return null;
      } finally {
        setSavingCommentId(null);
      }
    },
    [requestJson, taskId],
  );

  const startEditComment = (comment: TaskComment) => {
    setEditingCommentId(comment.id);
    setEditDraft(comment.body);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditDraft("");
  };

  const saveEditComment = async (commentId: string) => {
    if (editingCommentId !== commentId) return;
    const body = editDraft.trim();
    const existing = comments.find((comment) => comment.id === commentId);
    if (!body || (existing && existing.body.trim() === body)) {
      setEditingCommentId(null);
      setEditDraft("");
      return;
    }
    const updated = await patchComment(commentId, { body });
    if (updated) {
      setEditingCommentId(null);
      setEditDraft("");
    }
  };

  const toggleResolveThread = (comment: TaskComment) => {
    const nextResolved = !comment.resolvedAt;
    void patchComment(comment.id, {
      resolvedAt: nextResolved ? new Date().toISOString() : null,
    });
    if (nextResolved) {
      setExpandedResolvedIds((current) => {
        if (!current[comment.id]) return current;
        const next = { ...current };
        delete next[comment.id];
        return next;
      });
    }
  };

  const confirmDeleteComment = useCallback(
    (comment: TaskComment) => {
      const replyCount = comments.filter(
        (entry) => entry.parentCommentId === comment.id,
      ).length;
      Alert.alert(
        "Delete comment?",
        replyCount > 0
          ? `This will also remove ${replyCount} ${replyCount === 1 ? "reply" : "replies"}.`
          : "This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void (async () => {
                setError(null);
                try {
                  await requestJson<void>(
                    `/api/v1/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(comment.id)}`,
                    { method: "DELETE" },
                  );
                  setComments((current) =>
                    current.filter(
                      (entry) =>
                        entry.id !== comment.id &&
                        entry.parentCommentId !== comment.id,
                    ),
                  );
                  if (editingCommentId === comment.id) {
                    setEditingCommentId(null);
                    setEditDraft("");
                  }
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not delete comment.",
                  );
                }
              })();
            },
          },
        ],
      );
    },
    [comments, editingCommentId, requestJson, taskId],
  );

  const openCommentMenu = (
    target: TaskComment,
    options: { includeResolve: boolean },
  ) => {
    const buttons: {
      text: string;
      style?: "cancel" | "destructive" | "default";
      onPress?: () => void;
    }[] = [
      {
        text: "Edit",
        onPress: () => startEditComment(target),
      },
    ];
    if (options.includeResolve) {
      buttons.push({
        text: target.resolvedAt ? "Unresolve thread" : "Resolve thread",
        onPress: () => toggleResolveThread(target),
      });
    }
    buttons.push(
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDeleteComment(target),
      },
      { text: "Cancel", style: "cancel" },
    );

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: buttons.map((button) => button.text),
          cancelButtonIndex: buttons.length - 1,
          destructiveButtonIndex: buttons.findIndex(
            (button) => button.style === "destructive",
          ),
          disabledButtonIndices:
            savingCommentId === target.id || editingCommentId === target.id
              ? [0]
              : [],
        },
        (index) => {
          const selected = buttons[index];
          selected?.onPress?.();
        },
      );
      return;
    }

    Alert.alert(
      "Comment actions",
      undefined,
      buttons.map((button) => ({
        text: button.text,
        style: button.style,
        onPress: button.onPress,
      })),
    );
  };

  const renderCommentRow = (
    comment: TaskComment,
    options: { isReply?: boolean; includeResolve?: boolean },
  ) => {
    const isEditing = editingCommentId === comment.id;
    const isSaving = savingCommentId === comment.id;
    const agent = isAgentComment(comment);
    const avatarSrc = resolveCommentAvatarSrc(comment, currentUserAvatar);

    return (
      <View
        key={comment.id}
        style={[styles.commentRow, options.isReply ? styles.replyRow : null]}
      >
        <View style={styles.commentHeader}>
          <CommentAvatar
            name={comment.authorName}
            src={avatarSrc}
            isAgent={agent}
          />
          <View style={styles.commentHeaderText}>
            <Text
              style={[
                styles.commentAuthor,
                agent ? styles.commentAuthorAgent : null,
              ]}
              numberOfLines={1}
            >
              {agent ? "Agent" : comment.authorName}
            </Text>
            <Text style={styles.commentTime}>
              {formatRelativeTime(comment.createdAt)}
              {comment.resolvedAt ? " · Resolved" : ""}
            </Text>
          </View>
          <Pressable
            hitSlop={8}
            disabled={isSaving}
            onPress={() =>
              openCommentMenu(comment, {
                includeResolve: options.includeResolve ?? false,
              })
            }
            accessibilityLabel="Comment actions"
          >
            <Text style={styles.menuTrigger}>···</Text>
          </Pressable>
        </View>

        {isEditing ? (
          <View style={styles.editBlock}>
            <TextInput
              value={editDraft}
              onChangeText={setEditDraft}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              style={styles.composerInput}
              autoFocus
            />
            <View style={styles.editActions}>
              <Pressable onPress={cancelEditComment} hitSlop={8}>
                <Text style={styles.secondaryAction}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void saveEditComment(comment.id);
                }}
                disabled={isSaving || !editDraft.trim()}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.primaryAction,
                    isSaving || !editDraft.trim()
                      ? styles.actionDisabled
                      : null,
                  ]}
                >
                  {isSaving ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={styles.commentBody}>{comment.body}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Activity</Text>

      {loadingFeed ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.muted} />
          <Text style={styles.empty}>Loading activity…</Text>
        </View>
      ) : null}

      {!loadingFeed &&
      visibleActivities.length === 0 &&
      rootComments.length === 0 ? (
        <Text style={styles.empty}>No activity yet.</Text>
      ) : null}

      {!loadingFeed && activityTimeline.length > 0 ? (
        <View style={styles.timeline}>
          {visibleActivities.map((item) => {
            const children = item.children;
            const hasChildren = children != null && children.length > 1;
            const isGroupExpanded = Boolean(
              hasChildren && expandedAgentGroups[item.id],
            );
            const childActivities = hasChildren
              ? [...children].sort((a, b) =>
                  b.createdAt.localeCompare(a.createdAt),
                )
              : [];

            return (
              <View key={item.id} style={styles.eventBlock}>
                <View style={styles.eventRow}>
                  <View style={styles.eventLeading}>
                    <ActivityLeadingIcon activity={item.activity} />
                    {hasChildren ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() =>
                          setExpandedAgentGroups((current) => {
                            if (current[item.id]) {
                              const next = { ...current };
                              delete next[item.id];
                              return next;
                            }
                            return { ...current, [item.id]: true };
                          })
                        }
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isGroupExpanded }}
                        accessibilityLabel={
                          isGroupExpanded
                            ? "Hide individual turns"
                            : `Show ${children.length} individual turns`
                        }
                      >
                        <Text
                          style={[
                            styles.eventExpand,
                            isGroupExpanded ? styles.eventExpandOpen : null,
                          ]}
                        >
                          ›
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.eventBody}>
                    <Text style={styles.eventText}>
                      {formatActivityMessage(item.activity)}
                      {hasChildren ? ` · ${children.length} turns` : ""}
                      {item.count > 1 ? ` ×${item.count}` : ""}
                    </Text>
                    <Text style={styles.eventTime}>
                      {formatRelativeTime(item.at)}
                    </Text>
                  </View>
                </View>
                {isGroupExpanded ? (
                  <View style={styles.eventChildren}>
                    {childActivities.map((child, index) => (
                      <View
                        key={child.id}
                        style={[
                          styles.eventChild,
                          index === childActivities.length - 1
                            ? styles.eventChildLast
                            : null,
                        ]}
                      >
                        <Text style={styles.eventChildText}>
                          {formatActivityMessage(child)}
                        </Text>
                        <Text style={styles.eventTime}>
                          {formatRelativeTime(child.createdAt)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
          {hiddenActivityCount > 0 ? (
            <Pressable
              onPress={() => setActivitiesExpanded((open) => !open)}
              style={styles.showMore}
            >
              <Text style={styles.showMoreText}>
                {activitiesExpanded
                  ? "Hide older events"
                  : `Show ${hiddenActivityCount} older ${
                      hiddenActivityCount === 1 ? "event" : "events"
                    }`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.comments}>
        <View style={styles.rootComposer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Leave a comment…"
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            style={styles.composerInput}
          />
          <Pressable
            style={[
              styles.sendButton,
              posting || !draft.trim() ? styles.sendButtonDisabled : null,
            ]}
            disabled={posting || !draft.trim()}
            onPress={() => {
              void postComment(draft);
            }}
            accessibilityLabel="Post comment"
          >
            <Text style={styles.sendButtonText}>{posting ? "…" : "↑"}</Text>
          </Pressable>
        </View>

        {rootComments.map((comment) => {
          const replies = repliesByParentId.get(comment.id) ?? [];
          const replyDraft = replyDrafts[comment.id] ?? "";
          const replyPending = postingReplyTo === comment.id;
          const isEditing = editingCommentId === comment.id;
          const isResolved = comment.resolvedAt != null;
          const isResolvedCollapsed =
            isResolved && !expandedResolvedIds[comment.id] && !isEditing;
          const threadCount = 1 + replies.length;
          const isEditingThread =
            editingCommentId != null &&
            (editingCommentId === comment.id ||
              replies.some((reply) => reply.id === editingCommentId));
          const isHoldThread =
            !isResolved && isAgentHoldCommentBody(comment.body);

          if (isResolvedCollapsed) {
            return (
              <Pressable
                key={comment.id}
                style={styles.resolvedSummary}
                onPress={() =>
                  setExpandedResolvedIds((current) => ({
                    ...current,
                    [comment.id]: true,
                  }))
                }
              >
                <Text style={styles.resolvedSummaryText}>
                  {threadCount} resolved{" "}
                  {threadCount === 1 ? "reply" : "replies"}
                  {comment.resolvedAt
                    ? ` · ${formatRelativeTime(comment.resolvedAt)}`
                    : ""}
                </Text>
              </Pressable>
            );
          }

          return (
            <View
              key={comment.id}
              style={[
                styles.threadCard,
                isResolved ? styles.threadCardResolved : null,
              ]}
            >
              {isResolved ? (
                <Pressable
                  onPress={() =>
                    setExpandedResolvedIds((current) => {
                      if (!current[comment.id]) return current;
                      const next = { ...current };
                      delete next[comment.id];
                      return next;
                    })
                  }
                  style={styles.collapseResolved}
                >
                  <Text style={styles.resolvedSummaryText}>Collapse</Text>
                </Pressable>
              ) : null}

              {renderCommentRow(comment, { includeResolve: true })}
              {replies.map((reply) =>
                renderCommentRow(reply, { isReply: true }),
              )}

              {!isEditingThread ? (
                <View style={styles.replyComposer}>
                  <TextInput
                    value={replyDraft}
                    onChangeText={(value) =>
                      setReplyDrafts((current) => ({
                        ...current,
                        [comment.id]: value,
                      }))
                    }
                    placeholder={
                      isHoldThread ? "Reply to agent…" : "Leave a reply…"
                    }
                    placeholderTextColor={colors.muted}
                    multiline
                    scrollEnabled={false}
                    textAlignVertical="top"
                    style={styles.composerInput}
                  />
                  <Pressable
                    style={[
                      styles.sendButton,
                      replyPending || !replyDraft.trim()
                        ? styles.sendButtonDisabled
                        : null,
                    ]}
                    disabled={replyPending || !replyDraft.trim()}
                    onPress={() => {
                      void postComment(replyDraft, comment.id);
                    }}
                    accessibilityLabel="Post reply"
                  >
                    <Text style={styles.sendButtonText}>
                      {replyPending ? "…" : "↑"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 18,
    gap: 12,
  },
  title: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  empty: {
    color: colors.muted,
    fontSize: 13,
  },
  timeline: {
    gap: 10,
  },
  eventBlock: {
    gap: 0,
  },
  showMore: {
    paddingVertical: 4,
  },
  showMoreText: {
    color: colors.muted,
    fontSize: 13,
  },
  eventRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  eventLeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minWidth: ACTIVITY_MARKER_SIZE,
  },
  eventMarker: {
    width: ACTIVITY_MARKER_SIZE,
    height: ACTIVITY_MARKER_SIZE,
    borderRadius: ACTIVITY_MARKER_SIZE / 2,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    opacity: 0.9,
  },
  glyphFallback: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  eventBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  eventText: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.72,
  },
  eventTime: {
    color: colors.muted,
    fontSize: 12,
  },
  eventExpand: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 16,
    marginTop: 1,
    transform: [{ rotate: "0deg" }],
  },
  eventExpandOpen: {
    transform: [{ rotate: "90deg" }],
  },
  eventChildren: {
    marginLeft: ACTIVITY_MARKER_SIZE / 2,
    paddingLeft: 14,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
    gap: 0,
  },
  eventChild: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 4,
    position: "relative",
  },
  eventChildLast: {
    // keeps branch stem from over-extending visually
  },
  eventChildText: {
    flex: 1,
    minWidth: 0,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  comments: {
    gap: 12,
    marginTop: 12,
    paddingBottom: 32,
  },
  threadCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: colors.surface,
  },
  threadCardResolved: {
    opacity: 0.85,
  },
  resolvedSummary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.faint,
  },
  resolvedSummaryText: {
    color: colors.muted,
    fontSize: 13,
  },
  collapseResolved: {
    alignSelf: "flex-start",
  },
  commentRow: {
    gap: 6,
  },
  replyRow: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commentHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallback: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  avatarInitials: {
    color: colors.foreground,
    fontSize: 9,
    fontWeight: "600",
  },
  commentAuthor: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  commentAuthorAgent: {
    color: "rgba(237, 237, 237, 0.75)",
  },
  commentTime: {
    color: colors.muted,
    fontSize: 11,
  },
  menuTrigger: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
  commentBody: {
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 20,
  },
  editBlock: {
    gap: 8,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 14,
  },
  secondaryAction: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
  primaryAction: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
  actionDisabled: {
    opacity: 0.4,
  },
  replyComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rootComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: colors.inputBg,
  },
  composerInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    maxHeight: 140,
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.buttonBg,
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  sendButtonText: {
    color: colors.buttonText,
    fontSize: 16,
    fontWeight: "700",
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
});
