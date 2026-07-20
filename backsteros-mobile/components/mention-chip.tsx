import { useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ParsedMentionToken } from "../lib/mention-tokens";
import { colors } from "../lib/theme";
import { LetterIcon } from "./letter-icon";
import { ProjectIcon } from "./project-icon";
import { TaskStatusIcon } from "./task-status-icon";

type Props = {
  token: ParsedMentionToken;
  label: string;
  deleted?: boolean;
  status?: string | null;
  href?: Href;
};

/** Compact mention chip — same role as desktop `.mention-chip-lite`. */
export function MentionChip({
  token,
  label,
  deleted = false,
  status,
  href,
}: Props) {
  const router = useRouter();
  const pressable = Boolean(href) && !deleted;

  const content = (
    <>
      <View style={styles.icon} accessibilityElementsHidden>
        {token.kind === "task" ? (
          <TaskStatusIcon status={status} size={14} />
        ) : token.kind === "letter" ? (
          <LetterIcon size={14} color={colors.muted} />
        ) : token.kind === "project" ? (
          <ProjectIcon size={14} color={colors.muted} />
        ) : (
          <Text style={styles.kindMark}>@</Text>
        )}
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </>
  );

  if (!pressable) {
    return (
      <View
        style={[styles.chip, deleted ? styles.chipDeleted : null]}
        accessibilityLabel={label}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        router.push(href!);
      }}
      style={({ pressed }) => [
        styles.chip,
        pressed ? styles.chipPressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    maxWidth: "100%",
  },
  chipPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  chipDeleted: {
    opacity: 0.6,
  },
  icon: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  kindMark: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  label: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    flexShrink: 1,
  },
});
