import { Stack, useLocalSearchParams } from "expo-router";

import { OrganizationDetailRoute } from "../../components/organization-detail-route";
import { tabDetailScreenOptions } from "../../lib/tab-stack-options";

/** Root-stack organization detail — preserves back to the previous screen. */
export default function RootOrganizationDetailRoute() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === "string" ? rawId : rawId?.[0] ?? "";

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <OrganizationDetailRoute organizationId={id} />
    </>
  );
}
