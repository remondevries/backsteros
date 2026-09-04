import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { isPadDevice } from "../lib/device";
import { resolveInboxEmailIconColor } from "../lib/email-list";
import { groupInboxRowsByAttentionStatus } from "../lib/inbox-attention";
import {
  findFlatGroupedRowIndex,
  flattenGroupedSections,
  type FlatGroupedRow,
  type GroupedSection,
} from "../lib/lists/flatten-grouped-sections";
import { getTaskStatusHeaderGradient } from "../lib/status-header-gradient";
import {
  reconcileTaskRowOverride,
  useTaskRowOverridesVersion,
  withTaskRowOverride,
} from "../lib/task-row-overrides";
import { groupTasksByStatus } from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useListJkNavigation } from "../lib/use-list-jk-navigation";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { BacksterGroupedList } from "./lists/index";
import { DetailContentContainer } from "./detail-content-container";
import { EmailNavIcon, CalendarNavIcon } from "./nav-icons";
import { InboxListItemRow } from "./inbox-list-item-row";
import { ProjectTypeGroupHeader } from "./project-type-group-header";
import {
  StatusGroupHeader,
  statusGroupEmptySectionFooter,
} from "./status-group-header";
import { TaskItemListRow } from "./task-item-list-row";
import { TaskPropertyPills } from "./task-property-pills";
import { TaskStatusIcon } from "./task-status-icon";

export type GroupedTaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  priority?: number | null;
  due_date?: string | null;
  due_end_date?: string | null;
  inbox?: boolean | number | null;
  project_name?: string | null;
  project_key?: string | null;
  project_icon?: string | null;
  project_type?: string | null;
  display_id?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assignee_avatar_storage_key?: string | null;
  /** Inbox email rows (desktop parity): email icon + email navigation. */
  item_type?: "task" | "email" | "meeting" | null;
  email_from?: string | null;
  email_inbox_id?: string | null;
  email_message_id?: string | null;
  meeting_id?: string | null;
};

type Section = {
  key: string;
  title: string;
  status: string;
  data: GroupedTaskRow[];
};

type Props = {
  rows: GroupedTaskRow[];
  onPressRow?: (row: GroupedTaskRow) => void;
  /**
   * When set (and status grouping is on), show a + on each status header
   * to add a task into that group — desktop `StatusGroupSection` parity.
   */
  onAddToStatus?: (status: string) => void;
  /** Master-detail selection highlight (iPad inbox / similar). */
  selectedId?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  emptyText: string;
  listHeader?: ReactNode;
  /** Hide project chip on rows (project Tasks tab). */
  showProject?: boolean;
  /**
   * When false, render a flat list with no status section headers
   * (legacy Inbox — all rows are triage anyway).
   * When `"inbox"`, group by Overdue / Triage / On Hold / In Review.
   */
  groupByStatus?: boolean | "inbox";
  /**
   * Keep empty status columns (Tasks / project / contact with +).
   * Default true. Set false to avoid FlashList mounting nine empty headers.
   */
  includeEmptyGroups?: boolean;
  /**
   * `inbox` — stacked desktop side-panel rows (type icon + title / meta).
   * `default` — phone compact or iPad task-board horizontal rows.
   */
  rowLayout?: "default" | "inbox";
  /**
   * Keep SectionList full-bleed (scrollbar on the pane edge) while centering
   * rows / headers at the detail content max width — iPad journal parity.
   */
  contentConstrained?: boolean;
};

const STATUS_ICON_SIZE = 20;

const CompactTaskRow = memo(function CompactTaskRow({
  item,
  onPressRow,
  assigneeAvatarSrc,
  highlighted,
  selected,
}: {
  item: GroupedTaskRow;
  onPressRow?: (row: GroupedTaskRow) => void;
  assigneeAvatarSrc?: string | null;
  highlighted?: boolean;
  selected?: boolean;
}) {
  const body = (
    <>
      <View style={ui.rowIcon}>
        {item.item_type === "email" ? (
          <EmailNavIcon
            size={STATUS_ICON_SIZE - 4}
            color={resolveInboxEmailIconColor(item.status)}
          />
        ) : item.item_type === "meeting" ? (
          <CalendarNavIcon size={STATUS_ICON_SIZE - 4} color={colors.muted} />
        ) : (
          <TaskStatusIcon status={item.status} size={STATUS_ICON_SIZE} />
        )}
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
        <TaskPropertyPills
          row={item}
          assigneeAvatarSrc={assigneeAvatarSrc}
        />
      </View>
    </>
  );

  const rowStyle = [
    ui.row,
    selected ? ui.listRowSelected : null,
    highlighted ? ui.keyboardNavHighlight : null,
  ];

  if (!onPressRow) {
    return <View style={rowStyle}>{body}</View>;
  }

  return (
    <Pressable
      onPress={() => onPressRow(item)}
      style={({ pressed }) => [
        ...rowStyle,
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
  onAddToStatus,
  selectedId = null,
  refreshing = false,
  onRefresh,
  emptyText,
  listHeader,
  showProject = true,
  groupByStatus = true,
  includeEmptyGroups = true,
  rowLayout = "default",
  contentConstrained = false,
}: Props) {
  const isPad = isPadDevice();
  const client = useMobileApiClient();
  const overridesVersion = useTaskRowOverridesVersion();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const constrain = useCallback(
    (node: ReactElement | null): ReactElement | null =>
      contentConstrained && node ? (
        <DetailContentContainer constrained>{node}</DetailContentContainer>
      ) : (
        node
      ),
    [contentConstrained],
  );

  const mergedRows = useMemo(
    () => rows.map((row) => withTaskRowOverride(row)),
    [overridesVersion, rows],
  );

  const avatarEntities = useMemo(() => {
    const seen = new Set<string>();
    const entities: { id: string; avatarStorageKey?: string | null }[] = [];
    for (const row of mergedRows) {
      const id = row.assignee_id?.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      entities.push({
        id,
        avatarStorageKey: row.assignee_avatar_storage_key,
      });
    }
    return entities;
  }, [mergedRows]);

  const avatarSrcById = useEntityAvatarSrcMap("contact", avatarEntities, client);

  useEffect(() => {
    for (const row of rows) {
      reconcileTaskRowOverride(row.id, row);
    }
  }, [rows]);

  const sections = useMemo<Section[]>(() => {
    if (groupByStatus === false) {
      return [{ key: "all", title: "", status: "", data: mergedRows }];
    }
    if (groupByStatus === "inbox") {
      return groupInboxRowsByAttentionStatus(mergedRows).map((group) => ({
        key: group.status,
        title: group.label,
        status: group.status,
        data: collapsed.has(group.status) ? [] : group.data,
      }));
    }
    return groupTasksByStatus(mergedRows, {
      includeEmpty: includeEmptyGroups,
    }).map((group) => ({
      key: group.status,
      title: group.label,
      status: group.status,
      data: collapsed.has(group.status) ? [] : group.tasks,
    }));
  }, [collapsed, groupByStatus, includeEmptyGroups, mergedRows]);

  const { rowIndexByItemId: flatMeta } = useMemo(
    () =>
      flattenGroupedSections(sections, {
        includeEmptyFooter: groupByStatus
          ? (section) => section.data.length === 0
          : undefined,
      }),
    [groupByStatus, sections],
  );

  const navigableIds = useMemo(
    () => sections.flatMap((section) => section.data.map((row) => row.id)),
    [sections],
  );

  const listRef = useRef<FlatList<FlatGroupedRow<GroupedTaskRow>>>(null);
  const rowsById = useMemo(() => {
    const map = new Map<string, GroupedTaskRow>();
    for (const row of mergedRows) map.set(row.id, row);
    return map;
  }, [mergedRows]);

  const activateRow = useCallback(
    (id: string) => {
      const row = rowsById.get(id);
      if (row && onPressRow) onPressRow(row);
    },
    [onPressRow, rowsById],
  );

  const { highlightedId } = useListJkNavigation({
    itemIds: navigableIds,
    enabled: Boolean(onPressRow),
    onActivate: activateRow,
    onHighlightChange: (id) => {
      if (!id || !listRef.current) return;
      const index = findFlatGroupedRowIndex(flatMeta, id);
      if (index == null) return;
      try {
        listRef.current.scrollToIndex({ index, animated: true, viewPosition: 0.35 });
      } catch {
        /* layout race */
      }
    },
  });

  const toggleStatus = useCallback((status: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const renderTaskItem = useCallback(
    (item: GroupedTaskRow, { highlighted }: { highlighted: boolean }) => {
      const assigneeAvatarSrc = item.assignee_id
        ? (avatarSrcById[item.assignee_id] ?? null)
        : null;
      const selected = selectedId === item.id;
      let row: ReactElement;
      if (rowLayout === "inbox") {
        row = (
          <InboxListItemRow
            task={{ ...item, assigneeAvatarSrc }}
            highlighted={highlighted}
            selected={selected}
            onPress={onPressRow ? () => onPressRow(item) : undefined}
          />
        );
      } else if (isPad) {
        row = (
          <TaskItemListRow
            task={{ ...item, assigneeAvatarSrc }}
            showProject={showProject}
            highlighted={highlighted}
            selected={selected}
            onPress={onPressRow ? () => onPressRow(item) : undefined}
          />
        );
      } else {
        row = (
          <CompactTaskRow
            item={item}
            onPressRow={onPressRow}
            assigneeAvatarSrc={assigneeAvatarSrc}
            highlighted={highlighted}
            selected={selected}
          />
        );
      }
      return contentConstrained ? (
        <DetailContentContainer constrained>{row}</DetailContentContainer>
      ) : (
        row
      );
    },
    [
      avatarSrcById,
      contentConstrained,
      isPad,
      onPressRow,
      rowLayout,
      selectedId,
      showProject,
    ],
  );

  const renderSectionHeader = useCallback(
    (section: Section) => {
      if (!groupByStatus) return null;
      const onAdd =
        onAddToStatus && section.status !== "overdue" && section.status !== "agents"
          ? () => {
              setCollapsed((current) => {
                const next = new Set(current);
                next.delete(section.status);
                return next;
              });
              onAddToStatus(section.status);
            }
          : undefined;
      if (groupByStatus === "inbox") {
        return constrain(
          <ProjectTypeGroupHeader
            title={section.title}
            collapsed={collapsed.has(section.status)}
            onToggle={() => toggleStatus(section.status)}
            onAdd={onAdd}
            addActionLabel="task"
          />,
        );
      }
      const iconStatus =
        section.status === "overdue" ? "on_hold" : section.status;
      return constrain(
        <StatusGroupHeader
          title={section.title}
          icon={<TaskStatusIcon status={iconStatus} size={14} />}
          gradient={getTaskStatusHeaderGradient(section.status)}
          collapsed={collapsed.has(section.status)}
          onToggle={() => toggleStatus(section.status)}
          onAdd={onAdd}
        />,
      );
    },
    [collapsed, constrain, groupByStatus, onAddToStatus, toggleStatus],
  );

  const renderSectionFooter = useCallback(
    (
      section: GroupedSection<GroupedTaskRow>,
      _allSections: readonly GroupedSection<GroupedTaskRow>[],
    ) => {
      if (!groupByStatus) return null;
      return statusGroupEmptySectionFooter(sections, section as Section);
    },
    [groupByStatus, sections],
  );

  const renderGroupedSectionHeader = useCallback(
    (
      section: GroupedSection<GroupedTaskRow>,
      _meta: { collapsed: boolean },
    ) => renderSectionHeader(section as Section),
    [renderSectionHeader],
  );

  const listHeaderElement = listHeader ? (
    <>{constrain(<>{listHeader}</>)}</>
  ) : null;

  return (
    <BacksterGroupedList
      ref={listRef}
      sections={sections}
      stickySectionHeaders={isPad && Boolean(groupByStatus)}
      highlightedId={highlightedId}
      renderItem={renderTaskItem}
      renderSectionHeader={renderGroupedSectionHeader}
      renderSectionFooter={groupByStatus ? renderSectionFooter : undefined}
      emptyText={emptyText}
      listHeader={listHeaderElement}
      refreshing={refreshing}
      onRefresh={onRefresh}
      estimatedItemSize={rowLayout === "inbox" ? 72 : isPad ? 88 : 56}
      estimatedHeaderSize={44}
    />
  );
}
