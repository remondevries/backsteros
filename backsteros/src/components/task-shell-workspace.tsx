import { useState, type ReactNode } from "react";
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "@backsteros/ui";

import { TaskShellTerminal } from "./task-shell-terminal";

export type TaskShellWorkspaceMode = "agents" | "terminal";

const MODE_OPTIONS: readonly SegmentedPillToggleOption<TaskShellWorkspaceMode>[] =
  [
    { value: "agents", label: "Agents" },
    { value: "terminal", label: "Terminal" },
  ];

export type TaskShellWorkspaceProps = {
  /** When false, the shell PTY is torn down (panel collapsed / other tab). */
  active: boolean;
  taskId: string;
  cwd: string | null;
  /** Agents view (who can work on this task). */
  agentsPane: ReactNode;
};

/**
 * Agent tab body: the task's agents or an interactive shell, with a
 * bottom-right Agents / Terminal toggle.
 */
export function TaskShellWorkspace({
  active,
  taskId,
  cwd,
  agentsPane,
}: TaskShellWorkspaceProps) {
  const [mode, setMode] = useState<TaskShellWorkspaceMode>("agents");
  const [terminalStarted, setTerminalStarted] = useState(false);
  const changeMode = (next: TaskShellWorkspaceMode) => {
    if (next === "terminal") setTerminalStarted(true);
    setMode(next);
  };

  return (
    <div className="task-shell-workspace">
      <div
        className="task-shell-workspace__pane task-shell-workspace__pane--agents"
        hidden={mode !== "agents"}
        aria-hidden={mode !== "agents" || undefined}
      >
        {agentsPane}
      </div>
      <div
        className="task-shell-workspace__pane"
        hidden={mode !== "terminal"}
        aria-hidden={mode !== "terminal" || undefined}
      >
        {/* Start on first open; stays connected while flipping back to Agents. */}
        <TaskShellTerminal
          active={active && terminalStarted}
          taskId={taskId}
          cwd={cwd}
        />
      </div>
      <div className="task-shell-workspace__mode-toggle">
        <SegmentedPillToggle
          value={mode}
          options={MODE_OPTIONS}
          onChange={changeMode}
          ariaLabel="Agents or Terminal"
        />
      </div>
    </div>
  );
}
