import { forwardRef } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { colors, spacing } from "../lib/theme";

const SEARCH_FIELD_HEIGHT = 44;

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onBlur?: TextInputProps["onBlur"];
};

/**
 * Inline list search — sits under the screen header (title / tabs), above rows.
 * Revealed via pull-down ({@link usePullToRevealSearch}).
 */
export const ListSearchField = forwardRef<TextInput, Props>(
  function ListSearchField(
    {
      value,
      onChangeText,
      placeholder = "Search",
      autoFocus = false,
      onBlur,
    },
    ref,
  ) {
    return (
      <View style={styles.host}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus={autoFocus}
          accessibilityLabel={placeholder}
          style={styles.input}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  host: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  input: {
    height: SEARCH_FIELD_HEIGHT,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.foreground,
  },
});
