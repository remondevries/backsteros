import { useMemo } from "react";
import { FileDiff } from "lucide-react";

import type { AgentChatActivityItem } from "../../lib/agent/agent-acp-activity";
import type { AgentChatMessage } from "../../lib/agent/agent-chat-transcript";
import { latestAgentChatChangedFiles } from "../../lib/agent/agent-chat-timeline";
import { DesktopAgentChatDiffPanel } from "../desktop-agent-chat-diff-panel";

export type AgentSurfaceDiffPaneProps = {
  messages: readonly AgentChatMessage[];
  liveActivities?: readonly AgentChatActivityItem[];
};

/**
 * Diff surface — single Pierre-based file list + viewer (no duplicate sidebar).
 */
export function AgentSurfaceDiffPane({
  messages,
  liveActivities,
}: AgentSurfaceDiffPaneProps) {
  const files = useMemo(
    () => latestAgentChatChangedFiles(messages, liveActivities),
    [liveActivities, messages],
  );

  if (files.length === 0) {
    return (
      <div className="agent-surface-pane agent-surface-pane--diff">
        <div className="agent-surface-empty agent-surface-empty--centered">
          <FileDiff size={20} aria-hidden strokeWidth={1.6} />
          <h3>No diffs yet</h3>
          <p>File changes from the agent turn will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-surface-pane agent-surface-pane--diff">
      <DesktopAgentChatDiffPanel
        files={files}
        variant="sheet"
        showClose={false}
        onClose={() => {
          /* Embedded in a surface tab — close via the tab bar. */
        }}
      />
    </div>
  );
}
