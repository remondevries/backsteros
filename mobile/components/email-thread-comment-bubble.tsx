import type { EmailThreadComment } from "@backsteros/contracts";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  parseEmailAgentTaskCard,
  type EmailAgentTaskCardPayload,
} from "../lib/agent/email-agent-prompt";
import { colors } from "../lib/theme";

type Props = {
  comment: EmailThreadComment;
  onOpenTask?: (card: EmailAgentTaskCardPayload) => void;
};

/**
 * Simple user/agent timeline bubble. TASK_CARD fences become a tappable chip.
 */
export function EmailThreadCommentBubble({ comment, onOpenTask }: Props) {
  const taskCard = parseEmailAgentTaskCard(comment.body ?? "");
  const isAgent = comment.author === "agent";
  const note = taskCard?.note?.trim() || null;
  const plain =
    !taskCard && comment.body?.trim() ? comment.body.trim() : null;

  return (
    <View
      style={[
        styles.row,
        isAgent ? styles.rowAgent : styles.rowUser,
      ]}
      accessibilityRole="text"
    >
      <View
        style={[
          styles.bubble,
          isAgent ? styles.bubbleAgent : styles.bubbleUser,
        ]}
      >
        <Text style={styles.author}>{isAgent ? "Agent" : "You"}</Text>
        {taskCard ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open task ${taskCard.card.displayId || taskCard.card.title}`}
            onPress={() => onOpenTask?.(taskCard.card)}
            style={({ pressed }) => [
              styles.taskCard,
              pressed ? { opacity: 0.75 } : null,
            ]}
          >
            <Text style={styles.taskId} numberOfLines={1}>
              {taskCard.card.displayId || taskCard.card.title}
            </Text>
            {taskCard.card.displayId ? (
              <Text style={styles.taskTitle} numberOfLines={2}>
                {taskCard.card.title}
              </Text>
            ) : null}
          </Pressable>
        ) : null}
        {note || plain ? (
          <Text style={styles.body}>{note || plain}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  rowUser: {
    alignItems: "flex-end",
  },
  rowAgent: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  bubbleUser: {
    backgroundColor: "rgba(103, 162, 90, 0.28)",
  },
  bubbleAgent: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  author: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  body: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 21,
  },
  taskCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.16)",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  taskId: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
  taskTitle: {
    color: colors.muted,
    fontSize: 13,
  },
});
