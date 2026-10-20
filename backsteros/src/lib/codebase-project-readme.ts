import { useCallback, useEffect, useState } from "react";

import {
  CODEBASE_PROJECT_README_FILENAME,
  resolveCodebaseProjectReadmeFileName,
  type ProjectFsClient,
} from "@backsteros/ui";

function joinRoot(root: string, relative: string): string {
  const base = root.replace(/[\\/]+$/, "");
  const rel = relative.replace(/\\/g, "/").replace(/^\/+/, "");
  return rel ? `${base}/${rel}` : base;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

/**
 * Load / save root README.md as the codebase Overview description.
 * Requires a working directory; does not use `projects.description`.
 */
export function useCodebaseProjectReadme(options: {
  enabled: boolean;
  workingDirectory: string | null;
  fs: ProjectFsClient;
}): {
  body: string;
  loading: boolean;
  error: string | null;
  fileName: string;
  save: (next: string) => Promise<void>;
} {
  const { enabled, workingDirectory, fs } = options;
  const [body, setBody] = useState("");
  const [fileName, setFileName] = useState(CODEBASE_PROJECT_README_FILENAME);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBody("");
      setFileName(CODEBASE_PROJECT_README_FILENAME);
      setLoading(false);
      setError(null);
      return;
    }
    if (!workingDirectory) {
      setBody("");
      setFileName(CODEBASE_PROJECT_README_FILENAME);
      setLoading(false);
      setError("Set a working directory to load README.md.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const listed = await fs.listEntries(workingDirectory);
        if (cancelled) return;
        if (listed.error) {
          setBody("");
          setFileName(CODEBASE_PROJECT_README_FILENAME);
          setError(listed.error);
          setLoading(false);
          return;
        }
        const resolvedName = resolveCodebaseProjectReadmeFileName(
          listed.entries
            .filter((entry) => entry.kind === "file")
            .map((entry) => entry.name),
        );
        const existing = listed.entries.find(
          (entry) => entry.kind === "file" && entry.name === resolvedName,
        );
        setFileName(resolvedName);
        if (!existing) {
          setBody("");
          setLoading(false);
          return;
        }
        const file = await fs.readFile(workingDirectory, existing.path);
        if (cancelled) return;
        if (file.error) {
          setBody("");
          setError(file.error);
          setLoading(false);
          return;
        }
        if (file.binary || file.content == null) {
          setBody("");
          setError("README.md cannot be previewed as text.");
          setLoading(false);
          return;
        }
        setBody(file.content);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setBody("");
        setError(errorMessage(err, "Could not load README.md."));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, fs, workingDirectory]);

  const save = useCallback(
    async (next: string) => {
      if (!workingDirectory) {
        throw new Error("Set a working directory to save README.md.");
      }
      const listed = await fs.listEntries(workingDirectory);
      if (listed.error) {
        throw new Error(listed.error);
      }
      const resolvedName = resolveCodebaseProjectReadmeFileName(
        listed.entries
          .filter((entry) => entry.kind === "file")
          .map((entry) => entry.name),
      );
      const existing = listed.entries.find(
        (entry) => entry.kind === "file" && entry.name === resolvedName,
      );
      let absolutePath = existing?.path ?? null;
      if (!absolutePath) {
        const created = await fs.createEntry({
          root: workingDirectory,
          parent: workingDirectory,
          name: CODEBASE_PROJECT_README_FILENAME,
          kind: "file",
        });
        absolutePath = created.path;
        setFileName(CODEBASE_PROJECT_README_FILENAME);
      } else {
        setFileName(resolvedName);
      }
      // Ensure absolute path for Tauri / REST adapters.
      const target =
        absolutePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(absolutePath)
          ? absolutePath
          : joinRoot(workingDirectory, absolutePath);
      await fs.writeFile(workingDirectory, target, next);
      setBody(next);
      setError(null);
    },
    [fs, workingDirectory],
  );

  return { body, loading, error, fileName, save };
}
