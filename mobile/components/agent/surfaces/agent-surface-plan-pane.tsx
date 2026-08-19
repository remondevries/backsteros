import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors } from "../../../lib/theme";

export type AgentSurfacePlanStep = {
  step: string;
  status: "pending" | "inProgress" | "completed";
};

type Props = {
  proposedPlanMarkdown?: string | null;
  planSteps?: readonly AgentSurfacePlanStep[];
};

/**
 * Plan surface — empty until the agent proposes a plan (desktop parity).
 */
export function AgentSurfacePlanPane({
  proposedPlanMarkdown = null,
  planSteps = [],
}: Props) {
  const hasPlan = Boolean(proposedPlanMarkdown?.trim());
  const hasSteps = planSteps.length > 0;

  if (!hasPlan && !hasSteps) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No plan yet</Text>
        <Text style={styles.emptyBody}>
          When the agent proposes a plan, it will show up here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.body}
      accessibilityLabel="Agent plan"
    >
      {hasPlan && proposedPlanMarkdown ? (
        <Text style={styles.markdown}>{proposedPlanMarkdown.trim()}</Text>
      ) : null}
      {hasSteps ? (
        <View style={styles.steps}>
          {planSteps.map((step, index) => (
            <View key={`${step.step}-${index}`} style={styles.stepRow}>
              <Text style={styles.stepStatus}>
                {step.status === "completed"
                  ? "✓"
                  : step.status === "inProgress"
                    ? "…"
                    : "○"}
              </Text>
              <Text style={styles.stepLabel}>{step.step}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    padding: 16,
    gap: 16,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  markdown: {
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 21,
  },
  steps: {
    gap: 8,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepStatus: {
    color: colors.muted,
    fontSize: 14,
    width: 16,
    textAlign: "center",
  },
  stepLabel: {
    flex: 1,
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 20,
  },
});
