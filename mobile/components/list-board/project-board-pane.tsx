import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { patchEntityViaPowerSyncOrApi } from "../../lib/entity-mutations";
import {
  getProjectStatusLabel,
  groupProjectsByStatus,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "../../lib/project-status";
import { useMobilePowerSync } from "../../lib/powersync-context";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { ProjectStatusIcon } from "../project-status-icon";
import { PropertyOptionSheet, type PropertyOption } from "../property-option-sheet";
import { BoardColumnList, type BoardColumnGroup } from "./board-column-list";

export type ProjectBoardRow = {
  id: string;
  name: string | null;
  status: string | null;
  key?: string | null;
};

type Props = {
  rows: readonly ProjectBoardRow[];
  onPressRow: (row: ProjectBoardRow) => void;
};

export function ProjectBoardPane({ rows, onPressRow }: Props) {
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const [statusTarget, setStatusTarget] = useState<ProjectBoardRow | null>(null);

  const columns = useMemo((): BoardColumnGroup[] => {
    return groupProjectsByStatus(rows).map((group) => ({
      key: group.status,
      title: group.label,
      status: group.status,
      rows: group.projects.map((project) => ({
        id: project.id,
        title: project.name,
        status: project.status,
        display_id: project.key ?? null,
      })),
    }));
  }, [rows]);

  const statusOptions = useMemo<PropertyOption<ProjectStatus>[]>(
    () =>
      PROJECT_STATUS_ORDER.map((value) => ({
        value,
        label: getProjectStatusLabel(value),
        icon: <ProjectStatusIcon status={value} size={16} />,
      })),
    [],
  );

  const moveStatus = useCallback(
    async (projectId: string, status: ProjectStatus) => {
      await patchEntityViaPowerSyncOrApi(
        client,
        powerSync,
        "projects",
        projectId,
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
          const full = rows.find((entry) => entry.id === row.id);
          if (full) onPressRow(full);
        }}
        onPressStatus={(row) => {
          const full = rows.find((entry) => entry.id === row.id) ?? null;
          setStatusTarget(full);
        }}
      />
      <PropertyOptionSheet
        visible={statusTarget != null}
        title="Move to status"
        options={statusOptions}
        selected={(statusTarget?.status as ProjectStatus) ?? "backlog"}
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
