import type { Project } from "@backsteros/contracts";
import { ActivityIndicator, View } from "react-native";

import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { ProjectDetailScreen } from "./project-detail-screen";

type ProjectNameRow = {
  id: string;
  name: string | null;
};

type NameRow = {
  name: string | null;
};

type Props = {
  projectId: string;
};

const DETAIL_SQL = `SELECT id, name FROM projects
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

const EMPTY_SQL = `SELECT id, name FROM projects WHERE 0`;

/** Loads project title then renders detail (shared by tab + root routes). */
export function ProjectDetailRoute({ projectId: id }: Props) {
  const client = useMobileApiClient();

  const { rows, loading } = useSyncedOrRest<ProjectNameRow, NameRow>({
    sql: id ? DETAIL_SQL : EMPTY_SQL,
    params: id ? [id] : [],
    mapLocal: (synced) => synced.map((row) => ({ name: row.name })),
    fetchRest: async () => {
      if (!id) return [];
      const body = await client.requestJson<{ projects: Project[] }>(
        "/api/v1/projects",
      );
      const match = (body.projects ?? []).find((project) => project.id === id);
      return match ? [{ name: match.name ?? null }] : [];
    },
  });

  const title = rows[0]?.name ?? "Project";

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <ProjectDetailScreen projectId={id} title={title || "Untitled"} />
  );
}
