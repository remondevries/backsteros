import type { AgentChatTurnUiState } from "../../lib/agent/agent-acp-activity";
import type { AgentChatMessage } from "../../lib/agent/agent-chat-transcript";
import type { AgentSurfaceTab } from "../../lib/agent/agent-surface-tabs";
import { AgentSurfaceBrowserPane } from "../agent-surface/agent-surface-browser-pane";
import { AgentSurfaceTerminalPane } from "../agent-surface/agent-surface-terminal-pane";
import { AgentSurfaceFilesPane } from "../agent-surface/agent-surface-files-pane";
import { AgentSurfacePlanPane } from "../agent-surface/agent-surface-plan-pane";
import { AgentSurfaceDiffPane } from "../agent-surface/agent-surface-diff-pane";

/** Non-chat surface panes (browser / terminal / files / plan / diff tabs). */
export function AgentChatSurfacePanes({
  surfaceTabs,
  activeSurfaceTabId,
  chatOnly,
  collapsed,
  addMenuOpen,
  cwd,
  cwdAvailable,
  planMarkdownForSurface,
  planStepsForSurface,
  messages,
  turnUi,
  handleBrowserUrlChange,
}: {
  surfaceTabs: AgentSurfaceTab[];
  activeSurfaceTabId: string | null;
  chatOnly: boolean;
  collapsed: boolean;
  addMenuOpen: boolean;
  cwd: string | null;
  cwdAvailable: boolean;
  planMarkdownForSurface: string | null;
  planStepsForSurface: AgentChatTurnUiState["planSteps"];
  messages: AgentChatMessage[];
  turnUi: AgentChatTurnUiState;
  handleBrowserUrlChange: (tabId: string, url: string, title: string) => void;
}) {
  return (
    <>
            {surfaceTabs.map((tab) => {
              if (tab.kind === "chat" || chatOnly) return null;
              const active = tab.id === activeSurfaceTabId;
              return (
                <div
                  key={tab.id}
                  className={`desktop-agent-chat__pane desktop-agent-chat__pane--${tab.kind}${
                    active ? " is-active" : " is-inactive"
                  }`}
                  aria-label={tab.title}
                  aria-hidden={!active}
                >
                  {tab.kind === "browser" ? (
                    <AgentSurfaceBrowserPane
                      tabId={tab.id}
                      active={active && !collapsed}
                      overlayOpen={addMenuOpen}
                      initialUrl={tab.resourceId}
                      onUrlChange={(url, title) =>
                        handleBrowserUrlChange(tab.id, url, title)
                      }
                    />
                  ) : null}
                  {tab.kind === "terminal" && cwdAvailable && cwd ? (
                    <AgentSurfaceTerminalPane
                      cwd={cwd}
                      sessionKey={tab.id}
                      label={tab.title}
                      active={active && !collapsed}
                    />
                  ) : null}
                  {tab.kind === "terminal" && !cwdAvailable ? (
                    <p className="agent-surface-empty">
                      Set a project working directory to open a terminal.
                    </p>
                  ) : null}
                  {tab.kind === "files" && cwdAvailable && cwd ? (
                    <AgentSurfaceFilesPane cwd={cwd} />
                  ) : null}
                  {tab.kind === "files" && !cwdAvailable ? (
                    <p className="agent-surface-empty">
                      Set a project working directory to browse files.
                    </p>
                  ) : null}
                  {tab.kind === "plan" ? (
                    <AgentSurfacePlanPane
                      proposedPlanMarkdown={planMarkdownForSurface}
                      planSteps={planStepsForSurface}
                    />
                  ) : null}
                  {tab.kind === "diff" ? (
                    <AgentSurfaceDiffPane
                      messages={messages}
                      liveActivities={turnUi.activities}
                    />
                  ) : null}
                </div>
              );
            })}
    </>
  );
}
