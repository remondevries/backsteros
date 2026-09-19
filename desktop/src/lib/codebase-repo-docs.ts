import { useEffect, useState } from "react";

import type { KnowledgeListItem } from "@backsteros/ui";

import { useDesktopApi } from "./api-context";

export type CodebaseRepoDocEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  pinned: boolean;
};

export type CodebaseRepoDocsResponse = {
  docsPresent: boolean;
  entries: CodebaseRepoDocEntry[];
};

/** Flat document-tree rows for repo `docs/` plus pinned root `AGENTS.md`. */
export function codebaseRepoDocsToListItems(
  projectId: string,
  entries: readonly CodebaseRepoDocEntry[],
): KnowledgeListItem[] {
  return entries.map((entry) => {
    const slash = entry.path.lastIndexOf("/");
    return {
      id: entry.path,
      title: entry.name,
      path: entry.path,
      kind: entry.kind === "directory" ? "folder" : "document",
      parentId: slash === -1 ? null : entry.path.slice(0, slash),
      sortOrder: entry.pinned ? -1 : entry.kind === "directory" ? 0 : 1,
      projectId,
    };
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useCodebaseRepoDocs(options: {
  projectId: string | null;
  enabled: boolean;
}): {
  items: KnowledgeListItem[];
  docsPresent: boolean;
  loading: boolean;
  error: string | null;
} {
  const { projectId, enabled } = options;
  const { client } = useDesktopApi();
  const [state, setState] = useState<{
    items: KnowledgeListItem[];
    docsPresent: boolean;
    loading: boolean;
    error: string | null;
  }>({
    items: [],
    docsPresent: false,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !projectId) {
      setState({
        items: [],
        docsPresent: false,
        loading: false,
        error: null,
      });
      return;
    }

    const controller = new AbortController();
    setState({
      items: [],
      docsPresent: false,
      loading: true,
      error: null,
    });

    void client
      .requestJson<CodebaseRepoDocsResponse>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/docs`,
        { signal: controller.signal },
      )
      .then((body) => {
        if (controller.signal.aborted) return;
        setState({
          items: codebaseRepoDocsToListItems(projectId, body.entries),
          docsPresent: body.docsPresent,
          loading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState({
          items: [],
          docsPresent: false,
          loading: false,
          error: errorMessage(error, "Could not load repository docs."),
        });
      });

    return () => controller.abort();
  }, [client, enabled, projectId]);

  return state;
}

export function useCodebaseRepoDocFile(options: {
  projectId: string | null;
  relativePath: string | null;
  enabled: boolean;
}): {
  body: string;
  loading: boolean;
  error: string | null;
} {
  const { projectId, relativePath, enabled } = options;
  const { client } = useDesktopApi();
  const [state, setState] = useState<{
    body: string;
    loading: boolean;
    error: string | null;
  }>({ body: "", loading: false, error: null });

  useEffect(() => {
    if (!enabled || !projectId || !relativePath) {
      setState({ body: "", loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState({ body: "", loading: true, error: null });
    const query = new URLSearchParams({ path: relativePath });

    void client
      .requestJson<{
        binary: boolean;
        content: string | null;
      }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/fs/file?${query.toString()}`,
        { signal: controller.signal },
      )
      .then((file) => {
        if (controller.signal.aborted) return;
        if (file.binary || file.content == null) {
          setState({
            body: "",
            loading: false,
            error: "This file cannot be previewed as text.",
          });
          return;
        }
        setState({ body: file.content, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState({
          body: "",
          loading: false,
          error: errorMessage(error, "Could not open this document."),
        });
      });

    return () => controller.abort();
  }, [client, enabled, projectId, relativePath]);

  return state;
}
