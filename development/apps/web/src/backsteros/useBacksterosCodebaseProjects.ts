import { useCallback, useEffect, useRef, useState } from "react";

import { fetchBacksterosCodebaseProjects } from "./client";
import type { BacksterosCodebaseProject } from "./types";
import {
  stableJsonFingerprint,
  useBacksterosSoftPoll,
} from "./useBacksterosSoftPoll";

export type BacksterosCodebaseProjectsState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly projects: readonly BacksterosCodebaseProject[] }
  | { readonly status: "error"; readonly message: string };

export function useBacksterosCodebaseProjects(enabled: boolean): {
  readonly state: BacksterosCodebaseProjectsState;
  readonly reload: () => void;
} {
  const [state, setState] = useState<BacksterosCodebaseProjectsState>({ status: "idle" });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState((current) => (current.status === "ready" ? current : { status: "loading" }));

    void fetchBacksterosCodebaseProjects(controller.signal)
      .then((projects) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", projects });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Failed to load BacksterOS projects";
        setState({ status: "error", message });
      });

    return () => controller.abort();
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

  return { state, reload };
}
