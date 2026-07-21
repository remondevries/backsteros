import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { useKeyboardBottomInset } from "../lib/use-keyboard-bottom-inset";

const KEYBOARD_GUTTER = 16;

type Props = ScrollViewProps & {
  /** Bottom padding when the keyboard is closed. */
  bottomClearance?: number;
};

/**
 * ScrollView that shrinks for the soft keyboard and keeps content scrollable
 * above it. Use for document/task compose and edit screens.
 */
export function KeyboardAwareScrollView({
  bottomClearance = FLOATING_TAB_BAR_CLEARANCE,
  contentContainerStyle,
  style,
  keyboardShouldPersistTaps = "handled",
  ...rest
}: Props) {
  const keyboardHeight = useKeyboardBottomInset();
  const paddingBottom =
    keyboardHeight > 0 ? keyboardHeight + KEYBOARD_GUTTER : bottomClearance;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        {...rest}
        style={[styles.scroll, style]}
        contentContainerStyle={
          [
            contentContainerStyle,
            { paddingBottom },
          ] as StyleProp<ViewStyle>
        }
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
});
