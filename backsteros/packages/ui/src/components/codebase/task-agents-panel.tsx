import type { TaskAgentCandidate } from "../../tasks/task-agent-candidates.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";

export type TaskAgentsPanelProps = {
  candidates: readonly TaskAgentCandidate[];
  loading?: boolean;
  /** True when the list is the project's room members, not every agent. */
  roomKnown?: boolean;
};

/**
 * Static agent picker for a codebase task: who on the project could start
 * working on it. Start is not wired yet.
 */
export function TaskAgentsPanel({
  candidates,
  loading = false,
  roomKnown = false,
}: TaskAgentsPanelProps) {
  return (
    <section className="task-agents-panel" aria-label="Agents">
      <header className="task-agents-panel__header">
        <h3 className="task-agents-panel__title">Agents</h3>
        <p className="task-agents-panel__subtitle">
          {roomKnown
            ? "In this project's room"
            : "All agents. Room members show after Channel Connect"}
        </p>
      </header>

      {candidates.length === 0 ? (
        <p className="task-agents-panel__empty">
          {loading
            ? "Loading agents…"
            : "No agents yet. Add one in Settings → API → Agents."}
        </p>
      ) : (
        <ul className="task-agents-panel__list">
          {candidates.map((candidate) => (
            <li key={candidate.contactId} className="task-agents-panel__row">
              <AssigneeListMark
                label={candidate.name}
                avatarSrc={candidate.avatarSrc}
                size={28}
              />
              <div className="task-agents-panel__meta">
                <div className="task-agents-panel__name-line">
                  <span className="task-agents-panel__name">
                    {candidate.name}
                  </span>
                  {candidate.isLead ? (
                    <span className="task-agents-panel__badge">Lead</span>
                  ) : null}
                </div>
                <div className="task-agents-panel__status">
                  <span
                    className={[
                      "task-agents-panel__dot",
                      candidate.ready ? "is-ready" : "is-unready",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  {candidate.ready ? "Ready" : "Webhook not verified"}
                  {candidate.role ? (
                    <span className="task-agents-panel__role">
                      {" · "}
                      {candidate.role}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="task-agents-panel__start"
                disabled
                title="Starting agents from a task is coming soon"
              >
                Start
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
