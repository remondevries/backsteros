import { memo } from "react";

import { BacksterosFileTaskOrbIcon } from "~/backsteros/BacksterosFileTaskOrbIcon";
import { FILE_TASK_UI_PREVIEW } from "~/backsteros/fileTaskUiPreview";
import { useFileTaskCreatingStore } from "~/backsteros/fileTaskCreatingStore";
import { SidebarMenuButton } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Header orb entry — opens the file-as-task modal. */
export const SidebarFileTaskOrbEntry = memo(function SidebarFileTaskOrbEntry({
  onClick,
}: {
  readonly onClick: () => void;
}) {
  const liveCreating = useFileTaskCreatingStore((state) => state.creating !== null);
  const creating = liveCreating || FILE_TASK_UI_PREVIEW;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            className="relative text-sidebar-foreground/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar hover:text-sidebar-foreground"
            onClick={onClick}
            aria-label="File as BacksterOS task"
            aria-busy={creating || undefined}
            data-testid="backsteros-file-task-entry"
            data-creating={creating ? "" : undefined}
          />
        }
      >
        <BacksterosFileTaskOrbIcon size={20} />
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
          aria-hidden="true"
        />
      </TooltipTrigger>
      <TooltipPopup side="right">
        {creating ? "Filing BacksterOS task…" : "File as BacksterOS task (⇧C)"}
      </TooltipPopup>
    </Tooltip>
  );
});
