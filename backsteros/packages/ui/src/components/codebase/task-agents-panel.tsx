import type { TaskAgentCandidate } from "../../tasks/task-agent-candidates.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";

export type TaskAgentsPanelProps = {
  candidates: readonly TaskAgentCandidate[];
  loading?: boolean;
  /** True when the list is the project's room members, not every agent. */
  roomKnown?: boolean;
  /** Called when an agent card is activated. Omit while start is unwired. */
  onSelectAgent?: (candidate: TaskAgentCandidate) => void;
};

/**
 * Agent picker for a codebase task — card grid of who could start working.
 * Each card is one control; Start is a label inside the card.
 */
export function TaskAgentsPanel({
  candidates,
  loading = false,
  roomKnown = false,
  onSelectAgent,
}: TaskAgentsPanelProps) {
  return (
    <section className="task-agents-panel" aria-label="Agents">
      <header className="task-agents-panel__header">
        <h3 className="task-agents-panel__title">Select agent</h3>
      </header>

      {candidates.length === 0 ? (
        <p className="task-agents-panel__empty">
          {loading
            ? "Loading agents…"
            : roomKnown
              ? "No agents in this project's room yet."
              : "No agents yet. Add one in Settings → API → Agents."}
        </p>
      ) : (
        <ul className="task-agents-panel__list">
          {candidates.map((candidate) => {
            const jobTitle = candidate.jobTitle?.trim() || null;
            const label = [
              `Start ${candidate.name}`,
              jobTitle,
              candidate.ready ? "Online" : "Webhook not verified",
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <li key={candidate.contactId}>
                <button
                  type="button"
                  className="task-agents-panel__card"
                  aria-label={label}
                  title={
                    onSelectAgent
                      ? `Start ${candidate.name}`
                      : "Starting agents from a task is coming soon"
                  }
                  onClick={() => onSelectAgent?.(candidate)}
                >
                  <div className="task-agents-panel__avatar">
                    {candidate.isLead ? (
                      <span className="task-agents-panel__badge">Lead</span>
                    ) : null}
                    <AssigneeListMark
                      label={candidate.name}
                      avatarSrc={candidate.avatarSrc}
                      size={72}
                    />
                  </div>
                  <div className="task-agents-panel__meta">
                    <span className="task-agents-panel__name">
                      {candidate.name}
                    </span>
                    <span
                      className={[
                        "task-agents-panel__role",
                        jobTitle ? null : "is-empty",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={jobTitle ?? undefined}
                    >
                      {jobTitle ?? "No job title"}
                    </span>
                    <span
                      className={[
                        "task-agents-panel__status",
                        candidate.ready ? "is-ready" : "is-unready",
                      ].join(" ")}
                    >
                      <span
                        className="task-agents-panel__dot"
                        aria-hidden="true"
                      />
                      {candidate.ready ? "Online" : "Webhook not verified"}
                    </span>
                  </div>
                  <span className="task-agents-panel__start" aria-hidden="true">
                    Start
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
