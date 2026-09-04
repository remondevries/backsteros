import {
  forwardRef,
  useCallback,
  useMemo,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import {
  FlatList,
  RefreshControl,
  Text,
  type ViewStyle,
} from "react-native";

import {
  flattenGroupedSections,
  type FlatGroupedRow,
  type GroupedSection,
} from "../../lib/lists/flatten-grouped-sections";
import { findFlatGroupedRowIndex } from "../../lib/lists/flatten-grouped-sections";
import { ui } from "../../lib/ui";
import {
  BacksterFlashList,
  type BacksterFlashListProps,
} from "./backster-flash-list";

export type BacksterGroupedListProps<T extends { id: string }> = {
  sections: readonly GroupedSection<T>[];
  renderItem: (item: T, meta: { highlighted: boolean }) => ReactElement | null;
  renderSectionHeader: (
    section: GroupedSection<T>,
    meta: { collapsed: boolean },
  ) => ReactElement | null;
  renderSectionFooter?: (
    section: GroupedSection<T>,
    allSections: readonly GroupedSection<T>[],
  ) => ReactElement | null;
  stickySectionHeaders?: boolean;
  highlightedId?: string | null;
  keyForSection?: (section: GroupedSection<T>) => string;
  emptyText?: string;
  listHeader?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  estimatedItemSize?: number;
  estimatedHeaderSize?: number;
  contentContainerStyle?: ViewStyle;
} & Partial<
  Pick<
    BacksterFlashListProps<FlatGroupedRow<T>>,
    | "onScroll"
    | "onScrollEndDrag"
    | "scrollEventThrottle"
    | "keyboardDismissMode"
    | "alwaysBounceVertical"
    | "onEndReached"
    | "onEndReachedThreshold"
    | "ListFooterComponent"
    | "keyboardShouldPersistTaps"
  >
>;

function BacksterGroupedListInner<T extends { id: string }>(
  {
    sections,
    renderItem,
    renderSectionHeader,
    renderSectionFooter,
    stickySectionHeaders = false,
    highlightedId = null,
    keyForSection = (section) => section.key,
    emptyText,
    listHeader,
    refreshing = false,
    onRefresh,
    estimatedItemSize = 56,
    estimatedHeaderSize = 40,
    contentContainerStyle,
    ...listProps
  }: BacksterGroupedListProps<T>,
  ref: Ref<FlatList<FlatGroupedRow<T>>>,
) {
  void estimatedItemSize;
  void estimatedHeaderSize;
  const groupedSections = useMemo(
    () =>
      sections.map((section) => ({
        key: keyForSection(section),
        title: section.title,
        data: section.data,
      })),
    [keyForSection, sections],
  );

  const includeEmptyFooters = Boolean(renderSectionFooter);

  const { rows, stickyHeaderIndices } = useMemo(
    () =>
      flattenGroupedSections(groupedSections, {
        includeEmptyFooter: includeEmptyFooters
          ? (section) => section.data.length === 0
          : undefined,
      }),
    [groupedSections, includeEmptyFooters],
  );

  const renderRow = useCallback(
    ({ item }: { item: FlatGroupedRow<T> }) => {
      if (item.kind === "header") {
        const sectionIndex = groupedSections.findIndex(
          (s) => s.key === item.sectionKey,
        );
        const section = sections[sectionIndex];
        if (!section) return null;
        return renderSectionHeader(section, {
          collapsed: section.data.length === 0,
        });
      }
      if (item.kind === "footer") {
        const sectionIndex = groupedSections.findIndex(
          (s) => s.key === item.sectionKey,
        );
        const section = sections[sectionIndex];
        if (!section || !renderSectionFooter) return null;
        return renderSectionFooter(section, sections);
      }
      return renderItem(item.item, {
        highlighted: highlightedId === item.item.id,
      });
    },
    [
      groupedSections,
      highlightedId,
      renderItem,
      renderSectionFooter,
      renderSectionHeader,
      sections,
    ],
  );

  const listContentStyle = useMemo(
    () => ({
      paddingTop: listHeader ? 0 : 8,
      ...contentContainerStyle,
    }),
    [contentContainerStyle, listHeader],
  );

  return (
    <BacksterFlashList
      ref={ref}
      data={rows}
      keyExtractor={(item) => item.key}
      renderItem={renderRow}
      stickyHeaderIndices={stickySectionHeaders ? stickyHeaderIndices : undefined}
      ListHeaderComponent={listHeader ? <>{listHeader}</> : undefined}
      ListEmptyComponent={
        emptyText ? <Text style={ui.empty}>{emptyText}</Text> : undefined
      }
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
      contentContainerStyle={listContentStyle}
      {...listProps}
    />
  );
}

export const BacksterGroupedList = forwardRef(BacksterGroupedListInner) as <
  T extends { id: string },
>(
  props: BacksterGroupedListProps<T> & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref?: Ref<any>;
  },
) => ReactElement | null;

export { findFlatGroupedRowIndex };
