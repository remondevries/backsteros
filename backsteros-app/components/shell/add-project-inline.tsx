"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createProjectAction } from "@/lib/mutations/projects";
import { getProjectHrefFromKey } from "@/lib/project-sections";
import type { ProjectStatus } from "@/lib/project-status";

type AddProjectInlineProps = {
  status?: ProjectStatus;
  onCancel: () => void;
  onCreated?: (projectId: string) => void;
};

export function AddProjectInline({
  status,
  onCancel,
  onCreated,
}: AddProjectInlineProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      onCancel();
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await createProjectAction({ name: trimmed, status });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onCreated?.(result.projectId);
      onCancel();

      if (!onCreated) {
        router.push(getProjectHrefFromKey(result.projectKey));
      } else {
        router.refresh();
      }
    });
  }

  return (
    <li className="list-none">
      <form
        className="block rounded-sm bg-white/10 px-2 py-1.5 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <span className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-foreground/20" />
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
            onBlur={() => {
              if (!name.trim() && !isPending) {
                onCancel();
              }
            }}
            disabled={isPending}
            placeholder="Project name"
            aria-label="Project name"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
          />
        </span>

        {error ? (
          <span className="sr-only" role="alert">
            {error}
          </span>
        ) : null}
      </form>
      {error ? (
        <p className="px-2 pb-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
