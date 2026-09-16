import { CheckIcon, XIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";

import { fetchBacksterosTask } from "~/backsteros/client";
import { FILE_TASK_UI_PREVIEW, FILE_TASK_UI_PREVIEW_SUCCESS } from "~/backsteros/fileTaskUiPreview";
import { useFileTaskCreatingStore } from "~/backsteros/fileTaskCreatingStore";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { cn } from "~/lib/utils";
import { toastManager } from "../ui/toast";

function FileTaskOpenEyeIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M10.75 12a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0" />
      <path d="M1.943 10.153C3.458 8.074 6.918 4.25 12 4.25s8.542 3.824 10.057 5.903l.023.031c.258.355.468.643.598 1.142.055.212.072.464.072.674s-.017.462-.072.674c-.13.5-.34.787-.598 1.142l-.023.031C20.542 15.926 17.082 19.75 12 19.75s-8.542-3.824-10.057-5.903l-.023-.031c-.258-.355-.468-.643-.598-1.142A2.8 2.8 0 0 1 1.25 12c0-.21.017-.462.072-.674.13-.5.34-.787.598-1.142zM9.25 12a2.75 2.75 0 1 0 5.5 0 2.75 2.75 0 0 0-5.5 0m1.5 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0" />
    </svg>
  );
}

/** Success strip above Code / Servers / Git after a file-task webhook completes. */
export const SidebarFileTaskSuccessBanner = memo(function SidebarFileTaskSuccessBanner() {
  const liveJob = useFileTaskCreatingStore((state) => state.success);
  const dismissSuccess = useFileTaskCreatingStore((state) => state.dismissSuccess);
  const openTaskDetail = useBacksterosTaskDetailUiStore((state) => state.openTaskDetail);
  const [previewDismissed, setPreviewDismissed] = useState(false);

  const job =
    liveJob?.phase === "success"
      ? liveJob
      : FILE_TASK_UI_PREVIEW && !previewDismissed
        ? FILE_TASK_UI_PREVIEW_SUCCESS
        : null;

  const isPreview = FILE_TASK_UI_PREVIEW && job === FILE_TASK_UI_PREVIEW_SUCCESS;
  const { state: projectsState } = useBacksterosCodebaseProjects(job?.phase === "success");
  const [opening, setOpening] = useState(false);

  const handleOpenTask = useCallback(async () => {
    if (!job || job.phase !== "success") return;
    if (isPreview) {
      toastManager.add({
        type: "info",
        title: "Preview banner",
        description: "This control opens the filed task once a real callback lands.",
      });
      return;
    }
    const taskId = job.taskId?.trim();
    if (!taskId) {
      toastManager.add({
        type: "error",
        title: "Task link unavailable",
        description: "The agent did not return a task id.",
      });
      return;
    }
    setOpening(true);
    try {
      const task = await fetchBacksterosTask(taskId);
      const projects = projectsState.status === "ready" ? projectsState.projects : [];
      const project =
        (task.projectId ? projects.find((entry) => entry.id === task.projectId) : undefined) ??
        (job.projectKey ? projects.find((entry) => entry.key === job.projectKey) : undefined) ??
        null;
      if (!project) {
        toastManager.add({
          type: "error",
          title: "Could not open task",
          description: "Project for the filed task is not loaded yet.",
        });
        return;
      }
      openTaskDetail({ taskId: task.id, project });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not open task",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    } finally {
      setOpening(false);
    }
  }, [isPreview, job, openTaskDetail, projectsState]);

  if (!job || job.phase !== "success") return null;

  const detail = job.taskRef?.trim() || job.title?.trim() || job.summary?.trim() || "Task filed";
  const agentLabel = job.agentName.trim() || "Agent";
  const label = `${agentLabel} · ${detail}`;

  const canOpen = isPreview || Boolean(job.taskId?.trim());
  const openLabel = job.taskRef ? `Open ${job.taskRef}` : "Open filed task";

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-[10px] px-2 py-1.5",
        "bg-sidebar-row-hover/60 text-sidebar-foreground",
        canOpen && !opening ? "cursor-pointer" : "cursor-default",
      )}
      role="status"
      aria-live="polite"
      data-testid="backsteros-file-task-success"
      data-preview={isPreview ? "" : undefined}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-[10px] cursor-pointer outline-hidden disabled:cursor-default"
        aria-label={openLabel}
        disabled={opening || !canOpen}
        onClick={() => void handleOpenTask()}
      />
      <span
        className="pointer-events-none relative z-[1] flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"
        aria-hidden
      >
        <CheckIcon className="size-3.5" strokeWidth={2.5} />
      </span>
      <div className="pointer-events-none relative z-[1] min-w-0 flex-1">
        <div className="truncate text-xs font-medium leading-tight">Successfully filed</div>
        <div className="truncate text-[11px] leading-tight text-sidebar-muted-foreground">
          {label}
        </div>
      </div>
      <span
        className="pointer-events-none relative z-[1] inline-flex size-6 shrink-0 items-center justify-center text-sidebar-muted-foreground"
        aria-hidden
      >
        <FileTaskOpenEyeIcon className="size-3.5" />
      </span>
      <button
        type="button"
        className="relative z-[1] inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sidebar-muted-foreground outline-hidden"
        aria-label="Dismiss"
        onClick={() => {
          if (isPreview) setPreviewDismissed(true);
          else dismissSuccess();
        }}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
});
