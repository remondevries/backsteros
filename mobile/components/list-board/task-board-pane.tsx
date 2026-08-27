import type { TaskStatus } from "../../lib/task-status";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { patchEntityViaPowerSyncOrApi } from "../../lib/entity-mutations";
import { applyTaskRowOverride } from "../../lib/task-row-overrides";
import {
  getTaskStatusLabel,
  groupTasksByStatus,
  TASK_STATUS_ORDER,
} from "../../lib/task-status";
import { useMobilePowerSync } from "../../lib/powersync-context";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import type { GroupedTaskRow } from "../grouped-task-list";
import { PropertyOptionSheet, type PropertyOption } from "../property-option-sheet";
import { TaskStatusIcon } from "../task-status-icon";
import { BoardColumnList, type BoardColumnGroup } from "./board-column-list";

type Props = {
  rows: readonly GroupedTaskRow[];
  onPressRow: (row: GroupedTaskRow) => void;
};

export function TaskBoardPane({ rows, onPressRow }: Props) {
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const [statusTarget, setStatusTarget] = useState<GroupedTaskRow | null>(null);

  const taskRows = useMemo(
    () => rows.filter((row) => row.item_type !== "email" && row.item_type !== "meeting"),
    [rows],
  );

  const columns = useMemo((): BoardColumnGroup[] => {
    return groupTasksByStatus(taskRows, { includeEmpty: true }).map((group) => ({
      key: group.status,
      title: group.label,
      status: group.status,
      rows: group.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        display_id: task.display_id ?? null,
        subtitle: task.project_name ?? task.project_key ?? null,
      })),
    }));
  }, [taskRows]);

  const statusOptions = useMemo<PropertyOption<TaskStatus>[]>(
    () =>
      TASK_STATUS_ORDER.map((value) => ({
        value,
        label: getTaskStatusLabel(value),
        icon: <TaskStatusIcon status={value} size={16} />,
      })),
    [],
  );

  const moveStatus = useCallback(
    async (taskId: string, status: TaskStatus) => {
      applyTaskRowOverride(taskId, { status });
      await patchEntityViaPowerSyncOrApi(
        client,
        powerSync,
        "tasks",
        taskId,
        { status },
        { status },
      );
    },
    [client, powerSync],
  );

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <BoardColumnList
        columns={columns}
        onPressRow={(row) => {
          const full = taskRows.find((entry) => entry.id === row.id);
          if (full) onPressRow(full);
        }}
        onPressStatus={(row) => {
          const full = taskRows.find((entry) => entry.id === row.id) ?? null;
          setStatusTarget(full);
        }}
      />
      <PropertyOptionSheet
        visible={statusTarget != null}
        title="Move to status"
        options={statusOptions}
        selected={(statusTarget?.status as TaskStatus) ?? "triage"}
        onSelect={(value) => {
          const target = statusTarget;
          setStatusTarget(null);
          if (!target) return;
          void moveStatus(target.id, value);
        }}
        onClose={() => setStatusTarget(null)}
      />
    </View>
  );
}
