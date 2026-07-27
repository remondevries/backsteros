import { useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MentionChipLayout } from "../lib/mention-layout";
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
  displayId?: string | null;
  href?: Href;
  layout?: MentionChipLayout;
};

/** Compact mention chip — same role as desktop `.mention-chip-lite`. */
export function MentionChip({
  token,
  label,
  deleted = false,
  status,
  displayId,
  href,
  layout = "inline",
}: Props) {
  const router = useRouter();
  const pressable = Boolean(href) && !deleted;
  const chipLayout =
    token.kind === "task" ||
    token.kind === "project" ||
    token.kind === "letter"
      ? layout
      : "inline";
  const isBlock = chipLayout === "block";

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
      {isBlock && displayId ? (
        <Text style={styles.displayId} numberOfLines={1}>
          {displayId}
        </Text>
      ) : null}
      <Text
        style={[styles.label, isBlock ? styles.labelBlock : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  const chipStyle = [
    styles.chip,
    isBlock ? styles.chipBlock : null,
    deleted ? styles.chipDeleted : null,
  ];

  if (!pressable) {
    return (
      <View style={chipStyle} accessibilityLabel={label}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={isBlock ? 4 : 8}
      onPress={() => {
        router.push(href!);
      }}
      style={({ pressed }) => [
        ...chipStyle,
        pressed ? (isBlock ? styles.chipBlockPressed : styles.chipPressed) : null,
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
  chipBlock: {
    width: "100%",
    gap: 8,
    marginHorizontal: 0,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "transparent",
  },
  chipPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  chipBlockPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
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
  displayId: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 0,
  },
  label: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    flexShrink: 1,
  },
  labelBlock: {
    flex: 1,
    flexShrink: 1,
  },
});
