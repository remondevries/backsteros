import { useLocalSearchParams } from "expo-router";

import { ProjectDetailRoute } from "../../../components/project-detail-route";

export default function ProjectsProjectDetailRoute() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === "string" ? rawId : rawId?.[0] ?? "";
  return <ProjectDetailRoute projectId={id} />;
}
