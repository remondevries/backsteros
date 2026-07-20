import { memo, useCallback, useMemo, type ReactNode } from "react";
import {
  Pressable,
  SectionList,
  Text,
  View,
  type SectionListData,
} from "react-native";

import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { groupTasksByStatus } from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { TaskPropertyPills } from "./task-property-pills";
import { TaskStatusIcon } from "./task-status-icon";

export type GroupedTaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  priority?: number | null;
  due_date?: string | null;
  project_name?: string | null;
  display_id?: string | null;
};

type Section = {
  title: string;
  status: string;
  data: GroupedTaskRow[];
};

type Props = {
  rows: GroupedTaskRow[];
  onPressRow?: (row: GroupedTaskRow) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  emptyText: string;
  listHeader?: ReactNode;
};

const STATUS_ICON_SIZE = 20;

const TaskRow = memo(function TaskRow({
  item,
  onPressRow,
}: {
  item: GroupedTaskRow;
  onPressRow?: (row: GroupedTaskRow) => void;
}) {
  const body = (
    <>
      <View style={ui.rowIcon}>
        <TaskStatusIcon status={item.status} size={STATUS_ICON_SIZE} />
      </View>
      <View style={ui.rowBody}>
        <View style={ui.rowTitleLine}>
          <Text style={ui.rowTitle} numberOfLines={1} ellipsizeMode="tail">
            {item.title ?? "Untitled"}
          </Text>
          {item.display_id ? (
            <Text style={ui.rowId}>{item.display_id}</Text>
          ) : null}
        </View>
        <TaskPropertyPills row={item} />
      </View>
    </>
  );

  if (!onPressRow) {
    return <View style={ui.row}>{body}</View>;
  }

  return (
    <Pressable
      onPress={() => onPressRow(item)}
      style={({ pressed }) => [
        ui.row,
        pressed ? { backgroundColor: colors.rowPressed } : null,
      ]}
    >
      {body}
    </Pressable>
  );
});

export function GroupedTaskList({
  rows,
  onPressRow,
  refreshing = false,
  onRefresh,
  emptyText,
  listHeader,
}: Props) {
  const sections = useMemo<Section[]>(
    () =>
      groupTasksByStatus(rows).map((group) => ({
        title: group.label,
        status: group.status,
        data: group.tasks,
      })),
    [rows],
  );

  const renderItem = useCallback(
    ({ item }: { item: GroupedTaskRow }) => (
      <TaskRow item={item} onPressRow={onPressRow} />
    ),
    [onPressRow],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <Text style={ui.sectionHeader}>{section.title}</Text>
    ),
    [],
  );

  return (
    <SectionList
      style={ui.screen}
      sections={sections as SectionListData<GroupedTaskRow, Section>[]}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      refreshing={refreshing}
      onRefresh={onRefresh}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={listHeader ? () => <>{listHeader}</> : null}
      ListEmptyComponent={<Text style={ui.empty}>{emptyText}</Text>}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
    />
  );
}
