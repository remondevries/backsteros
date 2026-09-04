import { forwardRef, type ReactElement, type Ref } from "react";
import {
  FlatList,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { ui } from "../../lib/ui";

/**
 * Shared list surface for mobile.
 *
 * Historically backed by `@shopify/flash-list` v2. That build hits an infinite
 * layout loop (`Maximum update depth exceeded` in ViewHolderCollection) on
 * several embedded panes (contact detail, empty status groups, etc.). Use RN
 * FlatList until FlashList is upgraded / the layout bug is gone.
 */
export type BacksterFlashListProps<T> = Omit<
  FlatListProps<T>,
  "maintainVisibleContentPosition"
> & {
  /** Ignored — kept for FlashList call-site compatibility. */
  estimatedItemSize?: number;
  /** Ignored — FlashList recycling hint. */
  getItemType?: (item: T, index: number) => string | number;
  /** Ignored — FlashList layout hint. */
  overrideItemLayout?: (
    layout: { span?: number; size?: number },
    item: T,
    index: number,
  ) => void;
  /**
   * When true, skip floating-tab bottom inset and full-screen style
   * (embedded panes: codebase FS tree, GitHub lists).
   */
  embedded?: boolean;
};

export type BacksterFlashListRef<T> = FlatList<T>;

function BacksterFlashListInner<T>(
  {
    estimatedItemSize: _estimatedItemSize,
    getItemType: _getItemType,
    overrideItemLayout: _overrideItemLayout,
    embedded = false,
    keyboardShouldPersistTaps = "handled",
    contentContainerStyle,
    style,
    ...rest
  }: BacksterFlashListProps<T>,
  ref: Ref<FlatList<T>>,
) {
  const listStyle: StyleProp<ViewStyle> = embedded
    ? style
    : ([ui.screen, style] as StyleProp<ViewStyle>);

  return (
    <FlatList
      ref={ref}
      style={listStyle}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={[
        embedded ? null : { paddingBottom: FLOATING_TAB_BAR_CLEARANCE },
        contentContainerStyle,
      ]}
      {...rest}
    />
  );
}

export const BacksterFlashList = forwardRef(BacksterFlashListInner) as <T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: BacksterFlashListProps<T> & { ref?: Ref<any> },
) => ReactElement | null;
