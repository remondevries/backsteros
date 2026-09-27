import { useCallback, useEffect, useState } from "react";

import { fetchBacksterosCodebaseProjects } from "../../backsteros/client";
import { fetchLocalProjects, syncLocalProjects, type LocalProjectRecord } from "./hetznerApi";

/**
 * Local ops sidebar projects: durable registry on the T3 host, enriched with
 * BacksterOS codebase metadata (working directory, key, name).
 */
export function useLocalProjects(enabled = true): {
  readonly projects: readonly LocalProjectRecord[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
} {
  const [projects, setProjects] = useState<readonly LocalProjectRecord[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const codebase = await fetchBacksterosCodebaseProjects().catch(
          () => [] as Awaited<ReturnType<typeof fetchBacksterosCodebaseProjects>>,
        );
        const enrichment = codebase.map((project) => ({
          projectId: project.id,
          key: project.key,
          name: project.name,
          localWorkingDirectory: project.localWorkingDirectory,
          icon: project.icon ?? null,
        }));
        const codebaseIds = new Set(enrichment.map((entry) => entry.projectId));
        const synced = await syncLocalProjects(enrichment);
        if (cancelled) return;
        if (!synced.ok) {
          const fallback = await fetchLocalProjects();
          if (cancelled) return;
          if (!fallback.ok) {
            setError(synced.error ?? fallback.error ?? "Failed to load local projects");
            setProjects([]);
            return;
          }
          setProjects(
            (fallback.projects ?? []).filter((project) => codebaseIds.has(project.projectId)),
          );
          return;
        }
        setProjects(
          (synced.projects ?? []).filter((project) => codebaseIds.has(project.projectId)),
        );
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Failed to load local projects");
        setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  return { projects, loading, error, refresh };
}
