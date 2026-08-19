import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  listAgentSurfaceQuickOpenOptions,
  type AgentSurfaceQuickOpenKind,
} from "../../../lib/agent/agent-surface-quick-open";
import { colors } from "../../../lib/theme";

type Props = {
  onAddSurface: (kind: AgentSurfaceQuickOpenKind) => void;
  cwdAvailable?: boolean;
  chatAvailable?: boolean;
  isCodebaseProject?: boolean;
  diffAvailable?: boolean;
};

/**
 * Desktop-parity empty state: “Open a surface” cards for Agent / Browser /
 * Files / Plan (+ Diff when allowed).
 */
export function AgentSurfaceEmptyPicker({
  onAddSurface,
  cwdAvailable = true,
  chatAvailable = true,
  isCodebaseProject = false,
  diffAvailable = false,
}: Props) {
  const cards = listAgentSurfaceQuickOpenOptions({
    isCodebaseProject,
    diffAvailable,
  }).map((option) => {
    const available =
      option.kind === "chat"
        ? chatAvailable
        : option.needsCwd
          ? cwdAvailable
          : true;
    const disabledReason = !available
      ? option.kind === "chat"
        ? "Agent unavailable."
        : "Available when a project working directory is set."
      : null;
    return { ...option, available, disabledReason };
  });

  return (
    <View style={styles.root} accessibilityLabel="Open a surface">
      <Text style={styles.title}>Open a surface</Text>
      <View style={styles.grid}>
        {cards.map((card) => (
          <Pressable
            key={card.kind}
            accessibilityRole="button"
            accessibilityLabel={
              card.available
                ? card.label
                : (card.disabledReason ?? card.label)
            }
            accessibilityState={{ disabled: !card.available }}
            disabled={!card.available}
            onPress={() => {
              if (!card.available) return;
              onAddSurface(card.kind);
            }}
            style={({ pressed }) => [
              styles.card,
              !card.available ? styles.cardDisabled : null,
              pressed && card.available ? styles.cardPressed : null,
            ]}
          >
            <Text style={styles.cardLabel}>{card.label}</Text>
            <Text style={styles.cardDesc} numberOfLines={3}>
              {card.available
                ? card.description
                : (card.disabledReason ?? card.description)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: "center",
  },
  title: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  card: {
    width: "47%",
    minWidth: 140,
    maxWidth: 220,
    minHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    gap: 6,
  },
  cardPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
  },
  cardDisabled: {
    opacity: 0.45,
  },
  cardLabel: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  cardDesc: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
});
