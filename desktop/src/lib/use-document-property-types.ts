import { useCallback, useEffect, useMemo, useState } from "react";

import type { DocumentPropertyType } from "@backsteros/contracts";
import { getTaskDisplayId } from "@backsteros/ui";

import { useDesktopApi } from "./api-context";
import { useDesktopWorkspaceTasks } from "./workspace-data";

export function useDocumentPropertyTypes(projectId?: string | null) {
  const { client } = useDesktopApi();
  const [types, setTypes] = useState<DocumentPropertyType[]>([]);

  const reload = useCallback(async () => {
    const query = projectId
      ? `?projectId=${encodeURIComponent(projectId)}`
      : "";
    try {
      const body = await client.requestJson<{ types: DocumentPropertyType[] }>(
        `/api/v1/document-property-types${query}`,
      );
      setTypes(body.types);
    } catch {
      setTypes([]);
    }
  }, [client, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { types, reload };
}

export function useDocumentPropertyTaskOptions() {
  const { allTasks } = useDesktopWorkspaceTasks();
  return useMemo(
    () =>
      allTasks.flatMap((task) => {
        const displayId = getTaskDisplayId({
          number: task.number,
          projectId: task.projectId,
          projectKey: task.projectKey,
          contactId: task.contactId,
        });
        if (!displayId) return [];
        return [
          {
            value: displayId,
            label: `${displayId} ${task.title}`,
            searchTerms: `${displayId} ${task.title}`,
          },
        ];
      }),
    [allTasks],
  );
}
