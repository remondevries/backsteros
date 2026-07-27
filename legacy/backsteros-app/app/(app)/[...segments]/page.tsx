import { notFound } from "next/navigation";

import { WorkspaceScreen } from "@/components/workspace-screen";
import { isRouteFamily } from "@/lib/navigation";

export default async function WorkspaceRoute({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  const family = segments[0];
  if (!isRouteFamily(family)) notFound();
  return <WorkspaceScreen segments={segments} />;
}
