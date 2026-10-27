import { useEffect, useState } from "react";

import { SettingsContentHeader } from "@backsteros/ui";

import {
  dismissVersionMismatch,
  versionMismatchDismissalKey,
} from "../lib/local-core-version-mismatch";
import type {
  SyncIssueInstance,
  SyncIssueLayoutId,
  SyncIssueTone,
  SyncingHealthFacts,
} from "../lib/sync-issue-model";
import { useSyncingIssues } from "../lib/use-syncing-issues";
import { SettingsSyncingConflictPrototype } from "./settings-syncing-conflict-prototype";
import { SyncIssueResolveDetail } from "./settings-syncing-issue-gallery";

type Banner =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

/**
 * Settings → Syncing workbench.
 * Driven by PowerSync + ops sync-health — not static mocks.
 */
export function SettingsSyncingWorkbench({
  title = "Syncing",
  description = "Cloud and local sync status, conflicts, and replication",
}: {
  title?: string;
  description?: string;
}) {
  const syncing = useSyncingIssues();
  const [selectedId, setSelectedId] = useState<SyncIssueLayoutId | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [forceSyncing, setForceSyncing] = useState(false);
  const visibleIssues = syncing.issues;

  const runForceSync = () => {
    if (forceSyncing) return;
    setForceSyncing(true);
    setBanner(null);
    void syncing
      .forceSync()
      .then((result) => {
        setBanner({
          kind: "success",
          message: result.uploaded
            ? "Forced sync — pending uploads flushed and channel reconnected."
            : "Forced sync — channel reconnected.",
        });
      })
      .catch((error) => {
        setBanner({
          kind: "error",
          message:
            error instanceof Error ? error.message : "Forced sync failed.",
        });
      })
      .finally(() => setForceSyncing(false));
  };

  // If the open detail disappeared from the live queue, return to triage.
  useEffect(() => {
    if (selectedId == null) return;
    if (!visibleIssues.some((issue) => issue.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visibleIssues]);

  const selected =
    selectedId == null
      ? null
      : (visibleIssues.find((issue) => issue.id === selectedId) ?? null);

  const clearLocally = (id: SyncIssueLayoutId, message: string) => {
    if (id === "version-drift") {
      const drift = syncing.snapshot.versionDrift;
      if (drift) {
        dismissVersionMismatch(
          versionMismatchDismissalKey({
            localCommit: drift.localCommit,
            peerCommit: drift.peerCommit,
          }),
        );
      }
    }
    syncing.dismissIssue(id);
    setSelectedId(null);
    setBanner({ kind: "success", message });
  };

  const actionableCount = visibleIssues.filter(
    (issue) => issue.tone === "error" || issue.tone === "warning",
  ).length;
  const issueCountLabel =
    syncing.loading && visibleIssues.length === 0
      ? "Checking"
      : actionableCount === 0
        ? "Healthy"
        : actionableCount === 1
          ? "1 issue"
          : `${actionableCount} issues`;

  return (
    <div className="settings-sync-workbench">
      <SettingsContentHeader
        title={title}
        description={description}
        titleBadge={
          <span
            className={[
              "settings-sync-workbench__count",
              actionableCount === 0
                ? "settings-sync-workbench__count--ok"
                : "settings-sync-workbench__count--warn",
            ].join(" ")}
          >
            {issueCountLabel}
          </span>
        }
        trailing={
          selected ? (
            <button
              type="button"
              className="settings-sync-workbench__back"
              onClick={() => setSelectedId(null)}
            >
              All issues
            </button>
          ) : (
            <div className="settings-sync-workbench__header-actions">
              <button
                type="button"
                className="settings-sync-workbench__back"
                disabled={forceSyncing}
                onClick={() => {
                  void syncing.refresh().catch((error) => {
                    setBanner({
                      kind: "error",
                      message:
                        error instanceof Error
                          ? error.message
                          : "Refresh failed.",
                    });
                  });
                }}
              >
                Refresh
              </button>
              <button
                type="button"
                className="settings-sync-issue__btn settings-sync-issue__btn--primary"
                disabled={forceSyncing || syncing.snapshot.offline}
                onClick={runForceSync}
              >
                {forceSyncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
          )
        }
      />

      {banner ? (
        <div
          className={[
            "settings-sync-workbench__banner",
            banner.kind === "success"
              ? "settings-sync-workbench__banner--ok"
              : "settings-sync-workbench__banner--err",
          ].join(" ")}
          role="status"
        >
          <span>{banner.message}</span>
          <button
            type="button"
            className="settings-sync-workbench__banner-dismiss"
            aria-label="Dismiss"
            onClick={() => setBanner(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      {visibleIssues.length === 0 ? (
        <EmptyHealthyState
          health={syncing.health}
          loading={syncing.loading}
          forceSyncing={forceSyncing}
          offline={syncing.snapshot.offline}
          onForceSync={runForceSync}
        />
      ) : selected ? (
        <DetailPane
          issue={selected}
          remainingCount={visibleIssues.length}
          syncing={syncing}
          onDismissed={(message) => clearLocally(selected.id, message)}
          onActionSucceeded={(message) => {
            setBanner({ kind: "success", message });
            void syncing.refresh();
          }}
          onFailed={(message) => setBanner({ kind: "error", message })}
        />
      ) : (
        <TriageList
          issues={visibleIssues}
          onSelect={(id) => {
            setBanner(null);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

function EmptyHealthyState({
  health,
  loading,
  forceSyncing,
  offline,
  onForceSync,
}: {
  health: SyncingHealthFacts;
  loading: boolean;
  forceSyncing: boolean;
  offline: boolean;
  onForceSync: () => void;
}) {
  return (
    <section
      className="settings-sync-workbench__empty"
      aria-label="Sync healthy"
    >
      <div className="settings-sync-workbench__empty-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M7.5 12.5 10.2 15.2 16.5 8.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity="0.35"
          />
        </svg>
      </div>
      <h3 className="settings-sync-workbench__empty-title">
        {loading ? "Checking sync…" : "Sync is healthy"}
      </h3>
      <p className="settings-sync-workbench__empty-copy">
        {loading
          ? "Reading PowerSync and replication health."
          : "No conflicts, dead letters, or channel problems right now. Local and cloud stay in step until something needs a decision."}
      </p>
      <dl className="settings-sync-workbench__health">
        <div>
          <dt>PowerSync</dt>
          <dd>{health.powerSyncLabel}</dd>
        </div>
        <div>
          <dt>Upload queue</dt>
          <dd>{health.uploadQueueLabel}</dd>
        </div>
        <div>
          <dt>Peer</dt>
          <dd>{health.peerLabel}</dd>
        </div>
        <div>
          <dt>Last sync</dt>
          <dd>{health.lastSyncLabel}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="settings-sync-issue__btn settings-sync-issue__btn--primary"
        disabled={forceSyncing || offline || loading}
        onClick={onForceSync}
      >
        {forceSyncing ? "Syncing…" : "Sync now"}
      </button>
    </section>
  );
}

function TriageList({
  issues,
  onSelect,
}: {
  issues: SyncIssueInstance[];
  onSelect: (id: SyncIssueLayoutId) => void;
}) {
  return (
    <section
      className="settings-sync-workbench__triage"
      aria-label="Open sync issues"
    >
      <p className="settings-sync-workbench__triage-lede">
        Open an issue to resolve it. Clearing one returns here when the live
        source confirms it is gone.
      </p>
      <ul className="settings-sync-workbench__list">
        {issues.map((issue) => (
          <li key={issue.id}>
            <button
              type="button"
              className="settings-sync-workbench__row"
              onClick={() => onSelect(issue.id)}
            >
              <span
                className={[
                  "settings-sync-issue__badge",
                  badgeClassForTone(issue.tone),
                ].join(" ")}
              >
                {issue.badge}
              </span>
              <span className="settings-sync-workbench__row-copy">
                <span className="settings-sync-workbench__row-title">
                  {issue.title}
                </span>
                <span className="settings-sync-workbench__row-summary">
                  {issue.summary}
                </span>
              </span>
              <span
                className="settings-sync-workbench__row-chevron"
                aria-hidden="true"
              >
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DetailPane({
  issue,
  remainingCount,
  syncing,
  onDismissed,
  onActionSucceeded,
  onFailed,
}: {
  issue: SyncIssueInstance;
  remainingCount: number;
  syncing: ReturnType<typeof useSyncingIssues>;
  onDismissed: (message: string) => void;
  onActionSucceeded: (message: string) => void;
  onFailed: (message: string) => void;
}) {
  return (
    <section
      className="settings-sync-workbench__detail"
      aria-label={`Resolve ${issue.badge}`}
    >
      <div className="settings-sync-workbench__detail-meta">
        <span className="settings-sync-workbench__detail-count">
          Resolving · {remainingCount} open in queue
        </span>
      </div>

      {issue.layoutId === "conflict" ? (
        <SettingsSyncingConflictPrototype
          embedded
          onAllResolved={() =>
            onActionSucceeded("All field conflicts merged.")
          }
        />
      ) : (
        <SyncIssueResolveDetail
          issue={issue}
          actions={{
            retryPowerSync: syncing.retryPowerSync,
            flushUploads: syncing.flushUploads,
            retryDeadLetter: syncing.retryDeadLetter,
            acknowledgeDeadLetter: syncing.acknowledgeDeadLetter,
            refresh: syncing.refresh,
          }}
          onDismissed={onDismissed}
          onActionSucceeded={onActionSucceeded}
          onFailed={onFailed}
        />
      )}
    </section>
  );
}

function badgeClassForTone(tone: SyncIssueTone): string {
  switch (tone) {
    case "error":
      return "settings-sync-issue__badge--error";
    case "warning":
      return "settings-sync-issue__badge--warning";
    case "info":
      return "settings-sync-issue__badge--info";
    case "neutral":
      return "settings-sync-issue__badge--neutral";
  }
}
