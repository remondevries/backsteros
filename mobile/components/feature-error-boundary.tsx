import { Component, type ErrorInfo, type ReactNode } from "react";
import { Text, View } from "react-native";

import { colors } from "../lib/theme";
import { ui } from "../lib/ui";

type Props = {
  children: ReactNode;
  title: string;
  onReset?: () => void;
};

type State = {
  error: Error | null;
};

/** Scoped boundary — keeps WebView/agent/finance crashes from killing the app. */
export class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`[mobile] ${this.props.title} crashed`, error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={[ui.centered, { padding: 24, backgroundColor: colors.background }]}>
        <Text style={[ui.title, { marginBottom: 8 }]}>{this.props.title}</Text>
        <Text style={ui.body}>
          This panel hit an error. Try again or go back.
        </Text>
        <Text style={[ui.hint, { marginTop: 12, textAlign: "center" }]} onPress={this.reset}>
          Retry
        </Text>
      </View>
    );
  }
}
