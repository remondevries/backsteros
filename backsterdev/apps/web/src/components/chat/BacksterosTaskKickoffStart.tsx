import { useEffect } from "react";

import { Button } from "~/components/ui/button";
import { isBacksterosComposeModalOpen } from "~/backsteros/isBacksterosComposeModalOpen";
import { isBacksterosFileTaskModalOpen } from "~/backsteros/fileTaskUiStore";
import { useBacksterosContentEditModeActive } from "~/backsteros/markdown-editor/useBacksterosContentEditModeActive";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import { isMacPlatform } from "~/lib/utils";

function isStartWorkingShortcut(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
  );
}

export function BacksterosTaskKickoffStart(props: {
  readonly displayId: string | null;
  readonly title: string;
  readonly busy?: boolean;
  /** Active BacksterOS task for this kickoff (uuid). */
  readonly taskId?: string | null;
  readonly onStartWorking: () => void;
  readonly onAdvanced: () => void;
}) {
  const { displayId, title, busy = false, taskId = null, onStartWorking, onAdvanced } = props;
  const descriptionEditingTaskId = useBacksterosTaskDetailUiStore(
    (state) => state.descriptionEditingTaskId,
  );
  const contentEditModeActive = useBacksterosContentEditModeActive();
  const descriptionEditing =
    contentEditModeActive ||
    (descriptionEditingTaskId != null &&
      (taskId == null || descriptionEditingTaskId === taskId));
  const actionsDisabled = busy || descriptionEditing;
  const heading = displayId?.trim()
    ? `${displayId} · ${title.trim() || "Untitled"}`
    : title.trim() || "Untitled task";
  const startShortcutLabel = isMacPlatform(navigator.platform) ? "⌘↵" : "Ctrl+Enter";

  useEffect(() => {
    if (actionsDisabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      if (!isStartWorkingShortcut(event)) return;
      if (isBacksterosFileTaskModalOpen() || isBacksterosComposeModalOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      onStartWorking();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [actionsDisabled, onStartWorking]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-2 py-2 text-center">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-balance font-medium text-foreground text-xl tracking-tight sm:text-2xl">
          {heading}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          Start the agent on this task, or open advanced to edit the kickoff message first.
        </p>
      </div>
      <div className="flex w-full flex-col items-center gap-2">
        <Button
          type="button"
          size="lg"
          className="w-full max-w-xs"
          disabled={actionsDisabled}
          title={`Start working (${startShortcutLabel})`}
          onClick={onStartWorking}
        >
          Start working
        </Button>
        <button
          type="button"
          disabled={actionsDisabled}
          onClick={onAdvanced}
          className="text-muted-foreground text-sm underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          Advanced
        </button>
      </div>
    </div>
  );
}
