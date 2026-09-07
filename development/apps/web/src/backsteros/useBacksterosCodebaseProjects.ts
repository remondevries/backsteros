import { useCallback, useEffect, useRef, useState } from "react";

import { fetchBacksterosCodebaseProjects } from "./client";
import { applyProjectSortOrderPatches, type BacksterosProjectSortPatch } from "./project-reorder";
import type { BacksterosCodebaseProject } from "./types";
import { stableJsonFingerprint, useBacksterosSoftPoll } from "./useBacksterosSoftPoll";

export type BacksterosCodebaseProjectsState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly projects: readonly BacksterosCodebaseProject[] }
  | { readonly status: "error"; readonly message: string };

export function useBacksterosCodebaseProjects(enabled: boolean): {
  readonly state: BacksterosCodebaseProjectsState;
  readonly reload: () => void;
  readonly applySortOrderPatches: (patches: readonly BacksterosProjectSortPatch[]) => void;
} {
  const [state, setState] = useState<BacksterosCodebaseProjectsState>({ status: "idle" });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const stateRef = useRef(state);
  stateRef.current = state;
  const requestGenerationRef = useRef(0);

  const applySortOrderPatches = useCallback((patches: readonly BacksterosProjectSortPatch[]) => {
    setState((current) => {
      if (current.status !== "ready" || patches.length === 0) return current;
      return {
        status: "ready",
        projects: applyProjectSortOrderPatches(current.projects, patches),
      };
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      requestGenerationRef.current += 1;
      setState({ status: "idle" });
      return;
    }

    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    setState((current) => (current.status === "ready" ? current : { status: "loading" }));

    void fetchBacksterosCodebaseProjects(controller.signal)
      .then((projects) => {
        if (generation !== requestGenerationRef.current) return;
        setState({ status: "ready", projects });
      })
      .catch((error: unknown) => {
        if (generation !== requestGenerationRef.current) return;
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Failed to load BacksterOS projects";
        setState({ status: "error", message });
      });

    return () => {
      controller.abort();
    };
  }, [enabled, reloadToken]);

  useBacksterosSoftPoll(enabled && state.status === "ready", async () => {
    const current = stateRef.current;
    if (current.status !== "ready") return;
    const projects = await fetchBacksterosCodebaseProjects();
    if (stableJsonFingerprint(projects) === stableJsonFingerprint(current.projects)) {
      return;
    }
    setState({ status: "ready", projects });
  });

  return { state, reload, applySortOrderPatches };
}
