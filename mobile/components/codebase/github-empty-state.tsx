import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/theme";

type Props = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** When set, navigates to Settings → GitHub instead of calling onAction. */
  linkToGithubSettings?: boolean;
};

/** Empty / gate state for Commits and PRs panes. */
export function GithubEmptyState({
  title,
  message,
  actionLabel,
  onAction,
  linkToGithubSettings,
}: Props) {
  const router = useRouter();

  function handleAction() {
    if (linkToGithubSettings) {
      router.push({ pathname: "/settings", params: { tab: "github" } });
      return;
    }
    onAction?.();
  }

  const showAction = Boolean(actionLabel && (onAction || linkToGithubSettings));

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {showAction ? (
        <Pressable
          onPress={handleAction}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            pressed ? { opacity: 0.85 } : null,
          ]}
        >
          <Text style={styles.buttonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 10,
    justifyContent: "center",
  },
  title: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.buttonBg,
  },
  buttonLabel: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: "600",
  },
});
