import type { ProjectFsClient } from "@backsteros/ui";

type RequestJson = <T>(path: string, init?: RequestInit) => Promise<T>;

type FsEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
};

function stripTrailingSlash(path: string): string {
  if (path === "/" || /^[A-Za-z]:\/$/.test(path)) return path;
  return path.replace(/[\\/]+$/, "");
}

function isAbsolutePath(input: string): boolean {
  return input.startsWith("/") || /^[A-Za-z]:[\\/]/.test(input);
}

/** Map an absolute tree path onto the project's working directory. */
export function absoluteToProjectRelative(
  root: string,
  candidate: string,
): string {
  const rootNorm = stripTrailingSlash(root.trim().replace(/\\/g, "/"));
  const cand = stripTrailingSlash(candidate.trim().replace(/\\/g, "/"));
  if (!cand || cand === rootNorm) return "";
  const prefix = `${rootNorm}/`;
  if (cand.startsWith(prefix)) return cand.slice(prefix.length);
  if (!isAbsolutePath(cand)) return cand.replace(/^\/+/, "");
  throw new Error("Path is outside the project working directory.");
}

/** Expand an API-relative path back to the absolute path the file tree uses. */
export function projectRelativeToAbsolute(
  root: string,
  relative: string,
): string {
  const rootNorm = stripTrailingSlash(root.trim().replace(/\\/g, "/"));
  const rel = relative.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel) return rootNorm;
  return `${rootNorm}/${rel}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

/**
 * Browser filesystem adapter. The core API already knows the project's
 * local working directory, so the file tree does not need a Tauri path check.
 */
export function createRestProjectFs(options: {
  projectId: string;
  workingDirectory: string;
  requestJson: RequestJson;
}): ProjectFsClient {
  const { projectId, workingDirectory, requestJson } = options;
  const root = stripTrailingSlash(workingDirectory.trim());
  const base = `/api/v1/projects/${encodeURIComponent(projectId)}/fs`;

  function relativeOrError(path: string): string | { error: string } {
    try {
      return absoluteToProjectRelative(root, path);
    } catch (error) {
      return { error: errorMessage(error, "Invalid path.") };
    }
  }

  return {
    async listEntries(requested) {
      const relative = relativeOrError(requested);
      if (typeof relative !== "string") {
        return { path: requested, entries: [], error: relative.error };
      }
      try {
        const suffix = relative
          ? `?${new URLSearchParams({ path: relative }).toString()}`
          : "";
        const result = await requestJson<{ path: string; entries: FsEntry[] }>(
          `${base}/entries${suffix}`,
        );
        return {
          path: projectRelativeToAbsolute(root, result.path),
          entries: result.entries.map((entry) => ({
            ...entry,
            path: projectRelativeToAbsolute(root, entry.path),
          })),
        };
      } catch (error) {
        return {
          path: requested,
          entries: [],
          error: errorMessage(error, "Could not read directory."),
        };
      }
    },

    async createEntry({ parent, name, kind }) {
      const relativeParent = absoluteToProjectRelative(root, parent || root);
      const created = await requestJson<{
        path: string;
        name: string;
        kind: "file" | "directory";
        parent: string;
      }>(`${base}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent: relativeParent, name, kind }),
      });
      return {
        ...created,
        path: projectRelativeToAbsolute(root, created.path),
        parent: projectRelativeToAbsolute(root, created.parent),
      };
    },

    async readFile(_rootInput, fileInput) {
      const relative = relativeOrError(fileInput);
      if (typeof relative !== "string") {
        return {
          path: fileInput,
          name: fileInput.split("/").pop() || fileInput,
          size: 0,
          binary: false,
          content: null,
          error: relative.error,
        };
      }
      try {
        const query = new URLSearchParams({ path: relative });
        const file = await requestJson<{
          path: string;
          name: string;
          size: number;
          binary: boolean;
          content: string | null;
        }>(`${base}/file?${query.toString()}`);
        return {
          ...file,
          path: projectRelativeToAbsolute(root, file.path),
        };
      } catch (error) {
        return {
          path: fileInput,
          name: fileInput.split("/").pop() || fileInput,
          size: 0,
          binary: false,
          content: null,
          error: errorMessage(error, "Could not read file."),
        };
      }
    },

    async writeFile(_rootInput, fileInput, content) {
      const relative = absoluteToProjectRelative(root, fileInput);
      const file = await requestJson<{
        path: string;
        name: string;
        size: number;
        binary: boolean;
        content: string;
      }>(`${base}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: relative, content }),
      });
      return {
        ...file,
        path: projectRelativeToAbsolute(root, file.path),
      };
    },

    async deleteEntry(_rootInput, fileInput) {
      const relative = absoluteToProjectRelative(root, fileInput);
      const query = new URLSearchParams({ path: relative });
      const deleted = await requestJson<{
        path: string;
        name: string;
        kind: "file" | "directory";
        deleted: boolean;
      }>(`${base}/entries?${query.toString()}`, { method: "DELETE" });
      return {
        ...deleted,
        path: projectRelativeToAbsolute(root, deleted.path),
      };
    },

    async pickDirectory(defaultPath?: string) {
      const entered = window.prompt("Working directory", defaultPath ?? "");
      const trimmed = entered?.trim();
      return trimmed ? trimmed : null;
    },

    async readRawUrl() {
      return null;
    },
  };
}
