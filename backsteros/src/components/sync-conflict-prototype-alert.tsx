import type { SyncIssueInstance } from "../lib/sync-issue-model";
import { useSyncingIssues } from "../lib/use-syncing-issues";

/**
 * Sidebar footer alert when Syncing has open issues.
 * Driven by the same PowerSync + ops sync-health adapter as Settings → Syncing.
 */

export type SyncConflictPrototypeAlertProps = {
  /** Opens Settings → Syncing in a new product tab. */
  onOpenSyncingSettings?: () => void;
};

export function SyncConflictPrototypeAlert({
  onOpenSyncingSettings,
}: SyncConflictPrototypeAlertProps) {
  const { topIssue, hasIssues, loading } = useSyncingIssues();

  if (loading && !hasIssues) return null;
  if (!topIssue) return null;

  return <SyncIssueSidebarAlert issue={topIssue} onOpen={onOpenSyncingSettings} />;
}

function SyncIssueSidebarAlert({
  issue,
  onOpen,
}: {
  issue: SyncIssueInstance;
  onOpen?: () => void;
}) {
  return (
    <div
      className="sidebar-sync-conflict-prototype"
      role="alert"
      title={`${issue.badge}: ${issue.summary}`}
    >
      <div className="sidebar-sync-conflict-prototype-title">{issue.badge}</div>
      <div className="sidebar-sync-conflict-prototype-body">
        <span className="sidebar-sync-conflict-prototype-entity-title">
          {issue.title}
        </span>
      </div>
      <div className="sidebar-sync-conflict-prototype-detail">{issue.summary}</div>
      {onOpen ? (
        <button
          type="button"
          className="sidebar-sync-conflict-prototype-action"
          onClick={onOpen}
        >
          Open Syncing
        </button>
      ) : null}
    </div>
  );
}
