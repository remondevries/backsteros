import { Stack, useLocalSearchParams } from "expo-router";

import { ProjectDetailRoute } from "../../components/project-detail-route";
import { tabDetailScreenOptions } from "../../lib/tab-stack-options";

/** Root-stack project detail — preserves back to the previous screen (any tab). */
export default function RootProjectDetailRoute() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === "string" ? rawId : rawId?.[0] ?? "";

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <ProjectDetailRoute projectId={id} />
    </>
  );
}
