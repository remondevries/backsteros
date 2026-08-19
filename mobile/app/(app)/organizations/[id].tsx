import { useLocalSearchParams } from "expo-router";

import { OrganizationDetailRoute } from "../../../components/organization-detail-route";

export default function OrganizationsDetailRoute() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === "string" ? rawId : rawId?.[0] ?? "";
  return <OrganizationDetailRoute organizationId={id} />;
}
