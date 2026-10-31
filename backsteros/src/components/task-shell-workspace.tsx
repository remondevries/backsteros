import { useState } from "react";
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "@backsteros/ui";

import { TaskShellTerminal } from "./task-shell-terminal";

export type TaskShellWorkspaceMode = "terminal" | "ui";

const MODE_OPTIONS: readonly SegmentedPillToggleOption<TaskShellWorkspaceMode>[] =
  [
    { value: "terminal", label: "Terminal" },
    { value: "ui", label: "UI" },
  ];

export type TaskShellWorkspaceProps = {
  /** When false, the shell PTY is torn down (panel collapsed / other tab). */
  active: boolean;
  taskId: string;
  cwd: string | null;
};

/**
 * Terminal tab body: interactive shell or placeholder chat UI, with a
 * bottom-left Terminal / UI toggle.
 */
export function TaskShellWorkspace({
  active,
  taskId,
  cwd,
}: TaskShellWorkspaceProps) {
  const [mode, setMode] = useState<TaskShellWorkspaceMode>("terminal");

  return (
    <div className="task-shell-workspace">
      <div
        className="task-shell-workspace__pane"
        hidden={mode !== "terminal"}
        aria-hidden={mode !== "terminal" || undefined}
      >
        {/* Stay connected while flipping to UI so the shell session survives. */}
        <TaskShellTerminal active={active} taskId={taskId} cwd={cwd} />
      </div>
      <div
        className="task-shell-workspace__pane task-shell-workspace__pane--ui"
        hidden={mode !== "ui"}
        aria-hidden={mode !== "ui" || undefined}
      >
        <p className="task-shell-workspace__ui-placeholder">
          Chat UI coming soon.
        </p>
      </div>
      <div className="task-shell-workspace__mode-toggle">
        <SegmentedPillToggle
          value={mode}
          options={MODE_OPTIONS}
          onChange={setMode}
          ariaLabel="Terminal or UI"
        />
      </div>
    </div>
  );
}
