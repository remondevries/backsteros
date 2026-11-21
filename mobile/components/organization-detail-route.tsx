import type { Organization } from "@backsteros/contracts";
import { ActivityIndicator, View } from "react-native";

import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { OrganizationDetailScreen } from "./organization-detail-screen";

type OrganizationNameRow = {
  id: string;
  name: string | null;
};

type NameRow = {
  name: string | null;
};

type Props = {
  organizationId: string;
};

const DETAIL_SQL = `SELECT id, name FROM organizations
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

const EMPTY_SQL = `SELECT id, name FROM organizations WHERE 0`;

/** Loads organization title then renders detail (root-stack route). */
export function OrganizationDetailRoute({ organizationId: id }: Props) {
  const client = useMobileApiClient();

  const { rows, loading } = useSyncedOrRest<OrganizationNameRow, NameRow>({
    sql: id ? DETAIL_SQL : EMPTY_SQL,
    params: id ? [id] : [],
    mapLocal: (synced) => synced.map((row) => ({ name: row.name })),
    fetchRest: async () => {
      if (!id) return [];
      const organization = await client.requestJson<Organization>(
        `/api/v1/organizations/${encodeURIComponent(id)}`,
      );
      return [{ name: organization.name ?? null }];
    },
  });

  const title = rows[0]?.name ?? "Organization";

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <OrganizationDetailScreen
      organizationId={id}
      title={title || "Untitled"}
    />
  );
}
