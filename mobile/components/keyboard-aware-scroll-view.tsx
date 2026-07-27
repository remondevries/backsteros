import { forwardRef, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { useKeyboardBottomInset } from "../lib/use-keyboard-bottom-inset";

const KEYBOARD_GUTTER = 24;

type Props = ScrollViewProps & {
  /** Bottom padding when the keyboard is closed. */
  bottomClearance?: number;
  /**
   * When the keyboard is open and content grows, keep the end in view.
   * Useful for long-form editors (journal / documents).
   */
  keepEndVisibleWhileTyping?: boolean;
};

/**
 * ScrollView that reserves space for the soft keyboard so long-form text can
 * scroll fully above it. Pair multiline body TextInputs with scrollEnabled={false}
 * so this ScrollView owns vertical scrolling.
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, Props>(
  function KeyboardAwareScrollView(
    {
      bottomClearance = FLOATING_TAB_BAR_CLEARANCE,
      keepEndVisibleWhileTyping = false,
      contentContainerStyle,
      style,
      keyboardShouldPersistTaps = "handled",
      onContentSizeChange,
      onScroll,
      ...rest
    },
    ref,
  ) {
    const keyboardHeight = useKeyboardBottomInset();
    const innerRef = useRef<ScrollView | null>(null);
    const pinnedToEndRef = useRef(true);

    const paddingBottom =
      keyboardHeight > 0 ? keyboardHeight + KEYBOARD_GUTTER : bottomClearance;

    function setRefs(node: ScrollView | null) {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }

    function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
      onScroll?.(event);
      if (!keepEndVisibleWhileTyping) return;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromEnd =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      pinnedToEndRef.current = distanceFromEnd < 48;
    }

    return (
      <ScrollView
        {...rest}
        ref={setRefs}
        style={[styles.scroll, style]}
        contentContainerStyle={
          [
            contentContainerStyle,
            { paddingBottom },
          ] as StyleProp<ViewStyle>
        }
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode="interactive"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={(width, height) => {
          onContentSizeChange?.(width, height);
          if (
            keepEndVisibleWhileTyping &&
            keyboardHeight > 0 &&
            pinnedToEndRef.current
          ) {
            innerRef.current?.scrollToEnd({ animated: false });
          }
        }}
      />
    );
  },
);

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
});
