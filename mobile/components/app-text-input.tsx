import { forwardRef } from "react";
import {
  TextInput as RNTextInput,
  type TextInput as RNTextInputInstance,
  type TextInputProps,
} from "react-native";

import { colors } from "../lib/theme";

/**
 * Product TextInput — orange caret/selection to match web/desktop accent.
 */
export const AppTextInput = forwardRef<RNTextInputInstance, TextInputProps>(
  function AppTextInput(
    { selectionColor = colors.accent, cursorColor = colors.accent, ...props },
    ref,
  ) {
    return (
      <RNTextInput
        ref={ref}
        selectionColor={selectionColor}
        cursorColor={cursorColor}
        {...props}
      />
    );
  },
);

/** Drop-in alias so call sites can keep using `TextInput`. */
export const TextInput = AppTextInput;

/** Instance type for refs (`useRef` / `forwardRef`). */
export type TextInputRef = RNTextInputInstance;
