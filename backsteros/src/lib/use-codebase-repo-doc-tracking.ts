import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  findProjectDocumentForRepoPath,
  normalizeRepoDocumentPath,
} from "./codebase-repo-docs";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
} from "./workspace-data";

export function useCodebaseRepoDocTracking(options: {
  projectId: string;
  relativePath: string | null;
  title: string;
  enabled: boolean;
}) {
  const { projectId, relativePath, title, enabled } = options;
  const { projectDocuments } = useDesktopWorkspaceDocuments();
  const { createProjectDocument, patchDocument } = useDesktopWorkspaceActions();
  const documentsRef = useRef(projectDocuments);
  documentsRef.current = projectDocuments;
  const inflightRef = useRef<{ path: string; promise: Promise<string> } | null>(
    null,
  );

  const trackedDocument = useMemo(() => {
    if (!enabled || !relativePath) return null;
    return findProjectDocumentForRepoPath(
      projectDocuments,
      projectId,
      relativePath,
    );
  }, [enabled, projectDocuments, projectId, relativePath]);

  const ensureTrackingDocumentId = useCallback(async () => {
    if (!relativePath) {
      throw new Error("No repository document path");
    }
    const path = normalizeRepoDocumentPath(relativePath);
    const existing = findProjectDocumentForRepoPath(
      documentsRef.current,
      projectId,
      path,
    );
    if (existing) return existing.id;
    if (inflightRef.current?.path === path) {
      return inflightRef.current.promise;
    }
    const promise = createProjectDocument({
      projectId,
      title: title.trim() || path,
      path,
    })
      .then((created) => created.id)
      .catch((error) => {
        const again = findProjectDocumentForRepoPath(
          documentsRef.current,
          projectId,
          path,
        );
        if (again) return again.id;
        throw error;
      })
      .finally(() => {
        if (inflightRef.current?.path === path) {
          inflightRef.current = null;
        }
      });
    inflightRef.current = { path, promise };
    return promise;
  }, [createProjectDocument, projectId, relativePath, title]);

  useEffect(() => {
    if (!enabled || !relativePath) return;
    void ensureTrackingDocumentId();
  }, [enabled, ensureTrackingDocumentId, relativePath]);

  const persistTrackedDuration = useCallback(
    async (seconds: number | null) => {
      const id = await ensureTrackingDocumentId();
      const trackedMinutes =
        seconds != null && seconds >= 60 ? Math.floor(seconds / 60) : null;
      await patchDocument(id, {
        trackedDurationSeconds: seconds,
        trackedMinutes,
        ...(seconds != null && seconds > 0
          ? { lastTrackedAt: new Date().toISOString() }
          : {}),
      });
    },
    [ensureTrackingDocumentId, patchDocument],
  );

  return { trackedDocument, persistTrackedDuration };
}
