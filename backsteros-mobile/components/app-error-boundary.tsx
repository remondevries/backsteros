import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../lib/theme";

type Props = {
  children: ReactNode;
  /** Optional label for the recovery action. */
  resetLabel?: string;
  onReset?: () => void;
};

type State = {
  error: Error | null;
};

/**
 * Catches render errors so a single bad screen does not white-screen the app.
 * Pair with Sentry when `EXPO_PUBLIC_SENTRY_DSN` is set.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const { captureException } = require("../lib/sentry") as typeof import("../lib/sentry");
    captureException(error, { componentStack: info.componentStack });
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={styles.screen} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          {this.state.error.message || "An unexpected error occurred."}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={this.props.resetLabel ?? "Try again"}
          onPress={this.reset}
          style={({ pressed }) => [
            styles.button,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {this.props.resetLabel ?? "Try again"}
          </Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
});
