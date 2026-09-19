import { formatTrackedDuration } from "@backsteros/contracts";
import { TimetrackingSessionsPanel } from "../../packages/ui/src/components/calendar/timetracking-sessions-panel";
import type { TaskBoardCardTask } from "../../packages/ui/src/components/tasks/task-board-card";
import { useTaskTimerSessions } from "../lib/use-task-timer-sessions";

type TimetrackingSessionsDetailProps = {
  kind: "task" | "meeting";
  entityId: string;
  displayId: string | null;
  title: string;
  /** Fallback total when session history isn’t available. */
  trackedDurationSeconds?: number | null;
  boardTask?: TaskBoardCardTask | null;
  assigneeOptions?: import("../../packages/ui/src/components/dropdowns/searchable-dropdown").SearchableDropdownOption<string>[];
  avatarSrcByContactId?:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>;
  avatarSrcByActorName?:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>;
  avatarSrcByActorEmail?:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>;
  onOpenEntity?: () => void;
};

/**
 * Right-panel content for a selected timetracking list row: individual
 * timer sessions for tasks; meetings show the tracked total only.
 */
export function TimetrackingSessionsDetail({
  kind,
  entityId,
  displayId,
  title,
  trackedDurationSeconds = null,
  boardTask = null,
  assigneeOptions = [],
  avatarSrcByContactId,
  avatarSrcByActorName,
  avatarSrcByActorEmail,
  onOpenEntity,
}: TimetrackingSessionsDetailProps) {
  const taskId = kind === "task" ? entityId : null;
  const { sessions, loading, error, deleteSession, createSession, updateSessionActor } =
    useTaskTimerSessions(taskId);

  const emptyMessage =
    kind === "meeting"
      ? trackedDurationSeconds != null && trackedDurationSeconds > 0
        ? `Total tracked: ${formatTrackedDuration(trackedDurationSeconds)}. Individual session history isn’t available for meetings yet.`
        : "No tracked time on this meeting."
      : trackedDurationSeconds != null && trackedDurationSeconds > 0
        ? `Total on this task: ${formatTrackedDuration(trackedDurationSeconds)}. No session history found.`
        : "No timer sessions recorded yet.";

  return (
    <TimetrackingSessionsPanel
      displayId={displayId}
      title={title}
      kindLabel={kind === "meeting" ? "Meeting" : "Task"}
      sessions={kind === "task" ? sessions : []}
      loading={kind === "task" ? loading : false}
      errorMessage={kind === "task" ? error : null}
      emptyMessage={emptyMessage}
      boardTask={kind === "task" ? boardTask : null}
      assigneeOptions={kind === "task" ? assigneeOptions : []}
      avatarSrcByContactId={avatarSrcByContactId}
      avatarSrcByActorName={avatarSrcByActorName}
      avatarSrcByActorEmail={avatarSrcByActorEmail}
      onTitleClick={onOpenEntity}
      onDeleteSession={kind === "task" ? deleteSession : undefined}
      onAddSession={kind === "task" ? createSession : undefined}
      onSessionActorChange={kind === "task" ? updateSessionActor : undefined}
    />
  );
}
