import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput as RNTextInput,
  type StyleProp,
  type TextInput as RNTextInputInstance,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { colors } from "../lib/theme";

type Props = TextInputProps & {
  /**
   * Only focus after a deliberate tap. Scroll/drag gestures over the field
   * will not open the keyboard (default on — profile editors live in ScrollViews).
   */
  tapToFocus?: boolean;
};

function hostLayoutStyle(style: StyleProp<TextStyle>): ViewStyle | undefined {
  const flat = StyleSheet.flatten(style);
  if (!flat) return { alignSelf: "stretch" };
  return {
    flex: flat.flex,
    flexGrow: flat.flexGrow,
    flexShrink: flat.flexShrink,
    flexBasis: flat.flexBasis,
    width: flat.width,
    minWidth: flat.minWidth ?? (flat.flex === 1 ? 0 : undefined),
    maxWidth: flat.maxWidth,
    alignSelf: flat.alignSelf ?? "stretch",
  };
}

/**
 * Product TextInput — orange caret/selection to match web/desktop accent.
 * Defaults to tap-to-focus so scrolling a form does not open the keyboard.
 */
export const AppTextInput = forwardRef<RNTextInputInstance, Props>(
  function AppTextInput(
    {
      selectionColor = colors.accent,
      cursorColor = colors.accent,
      tapToFocus = true,
      editable = true,
      autoFocus,
      style,
      onBlur,
      onFocus,
      ...props
    },
    ref,
  ) {
    const inputRef = useRef<RNTextInputInstance>(null);
    const [armed, setArmed] = useState(() => Boolean(autoFocus));

    useImperativeHandle(ref, () => {
      const input = inputRef.current;
      if (!input) {
        return null as unknown as RNTextInputInstance;
      }
      return Object.create(input, {
        focus: {
          value: () => {
            setArmed(true);
            input.focus();
          },
        },
        blur: {
          value: () => {
            input.blur();
            setArmed(false);
          },
        },
      }) as RNTextInputInstance;
    });

    const canEdit = editable !== false;
    const needsArm = tapToFocus && canEdit;
    const isInteractive = canEdit && (!needsArm || armed);

    const field = (
      <RNTextInput
        {...props}
        ref={inputRef}
        style={style}
        editable={isInteractive}
        autoFocus={autoFocus}
        selectionColor={selectionColor}
        cursorColor={cursorColor}
        pointerEvents={isInteractive ? "auto" : "none"}
        onFocus={(event) => {
          setArmed(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          if (needsArm) setArmed(false);
          onBlur?.(event);
        }}
      />
    );

    if (!needsArm) {
      return field;
    }

    return (
      <Pressable
        accessibilityRole="none"
        disabled={armed || !canEdit}
        onPress={() => {
          setArmed(true);
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        }}
        style={hostLayoutStyle(style)}
      >
        {field}
      </Pressable>
    );
  },
);

/** Drop-in alias so call sites can keep using `TextInput`. */
export const TextInput = AppTextInput;

/** Instance type for refs (`useRef` / `forwardRef`). */
export type TextInputRef = RNTextInputInstance;
