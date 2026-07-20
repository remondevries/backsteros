import { Stack, useLocalSearchParams } from "expo-router";

import { TaskDetailScreen } from "../../components/task-detail-screen";
import { tabDetailScreenOptions } from "../../lib/tab-stack-options";

/** Root-stack task detail — preserves back to the previous screen (any tab). */
export default function RootTaskDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = typeof id === "string" ? id : id?.[0];

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <TaskDetailScreen taskId={taskId} />
    </>
  );
}
