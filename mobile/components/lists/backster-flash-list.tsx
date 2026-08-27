import { FlashList, type FlashListProps, type FlashListRef } from "@shopify/flash-list";
import { forwardRef, type ReactElement, type Ref } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { ui } from "../../lib/ui";

/** FlashList v2 dropped `estimatedItemSize`; callers may still pass it for layout hints. */
export type BacksterFlashListProps<T> = FlashListProps<T> & {
  estimatedItemSize?: number;
  /**
   * When true, skip floating-tab bottom inset and full-screen style
   * (embedded panes: codebase FS tree, GitHub lists).
   */
  embedded?: boolean;
};

function BacksterFlashListInner<T>(
  {
    estimatedItemSize: _estimatedItemSize,
    embedded = false,
    keyboardShouldPersistTaps = "handled",
    contentContainerStyle,
    style,
    ...rest
  }: BacksterFlashListProps<T>,
  ref: Ref<FlashListRef<T>>,
) {
  const listStyle: StyleProp<ViewStyle> = embedded
    ? (style as StyleProp<ViewStyle>)
    : ([ui.screen, style] as StyleProp<ViewStyle>);
  return (
    <FlashList
      ref={ref}
      style={listStyle as ViewStyle | undefined}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={{
        ...(embedded ? null : { paddingBottom: FLOATING_TAB_BAR_CLEARANCE }),
        ...(contentContainerStyle as object),
      }}
      {...rest}
    />
  );
}

export const BacksterFlashList = forwardRef(BacksterFlashListInner) as <T>(
  props: BacksterFlashListProps<T> & { ref?: Ref<FlashListRef<T>> },
) => ReactElement | null;
