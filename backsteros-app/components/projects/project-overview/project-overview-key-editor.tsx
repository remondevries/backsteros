"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { updateProjectKeyAction } from "@/lib/mutations/projects";
import { buildProjectKeyRenameRedirectPath } from "@/lib/entity-route-redirect";
import { updateLocalProjectKey } from "@/lib/sync/local-project-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { isValidProjectKey, normalizeProjectKey } from "@/lib/project-key";

import { ProjectOverviewPill } from "./project-overview-pill";

type ProjectOverviewKeyEditorProps = {
  projectId: string;
  value: string;
};

export function ProjectOverviewKeyEditor({
  projectId,
  value,
}: ProjectOverviewKeyEditorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const syncKey = `${projectId}|${value}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setDraft(value);
    setEditing(false);
    setError(null);
  }

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function cancelEditing() {
    setDraft(value);
    setEditing(false);
    setError(null);
  }

  function save() {
    const normalized = normalizeProjectKey(draft);
    setDraft(normalized);

    if (normalized === value) {
      setEditing(false);
      setError(null);
      return;
    }

    if (!isValidProjectKey(normalized)) {
      setError("Use 2–6 letters or numbers.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await runEntityPersist(
        () => updateLocalProjectKey({ projectId, key: normalized }),
        () => updateProjectKeyAction({ projectId, key: normalized }),
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setEditing(false);

      const nextKey =
        "projectKey" in result && typeof result.projectKey === "string"
          ? result.projectKey
          : normalized;
      const nextPathname = buildProjectKeyRenameRedirectPath(
        pathname,
        value,
        nextKey,
      );
      if (nextPathname !== pathname) {
        router.replace(nextPathname);
      }
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <ProjectOverviewPill className="gap-1 border border-white/10 bg-white/[0.03] px-2 py-0.5">
          <span className="text-foreground/50">ID</span>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => {
              setDraft(normalizeProjectKey(event.target.value));
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
            }}
            onBlur={() => {
              if (!isPending) {
                save();
              }
            }}
            disabled={isPending}
            maxLength={6}
            aria-label="Project ID"
            className="w-[4.5rem] border-none bg-transparent p-0 font-mono text-sm leading-[18px] text-foreground uppercase outline-none placeholder:text-foreground/40 disabled:opacity-60"
          />
        </ProjectOverviewPill>
        {error ? (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          setEditing(true);
          setError(null);
        }}
        className="inline-flex cursor-pointer rounded-full border-none bg-transparent p-0 text-left transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/20"
        aria-label={`Edit project ID: ${value}`}
      >
        <ProjectOverviewPill className="gap-1">
          <span className="text-foreground/50">ID</span>
          <span className="font-mono tabular-nums">{value}</span>
        </ProjectOverviewPill>
      </button>
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
