import { useLocalSearchParams } from "expo-router";

import { TaskDetailScreen } from "../../../components/task-detail-screen";

export default function InboxTaskDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskDetailScreen taskId={typeof id === "string" ? id : id?.[0]} />;
}
