import { useState } from "react";

import {
  formatDeadLetterNextRetry,
  type ReplicationDeadLetter,
} from "../lib/replication-dead-letters";
import type {
  SyncIssueInstance,
  SyncIssueLayoutId,
  SyncIssueTone,
  SyncReconcileMismatch,
  SyncUploadQueueItem,
} from "../lib/sync-issue-model";
import {
  DEAD_LETTER_MOCK,
  DRAFT_PROTECTED_MOCK,
  SYNC_ISSUE_PROTOTYPE_MOCKS,
  UPLOAD_QUEUE_MOCK,
  VERSION_DRIFT_MOCK,
  type SyncIssuePrototype,
} from "../lib/sync-issue-prototype-mocks";

export type SyncIssueResolveActions = {
  retryPowerSync?: () => Promise<void>;
  flushUploads?: () => Promise<boolean>;
  retryDeadLetter?: (id: string) => Promise<void>;
  acknowledgeDeadLetter?: (id: string) => Promise<void>;
  refresh?: () => Promise<void>;
};

type ResolveCallbacks = {
  /** Soft dismiss — hide until the live source drops the issue. */
  onDismissed?: (message: string) => void;
  /** Retry/ack/flush succeeded — keep showing until live state clears. */
  onActionSucceeded?: (message: string) => void;
  onFailed?: (message: string) => void;
  actions?: SyncIssueResolveActions;
};

/**
 * Stacked mock layouts for visual review (not used by the live workbench).
 */
export function SettingsSyncingIssueGallery({
  issues = SYNC_ISSUE_PROTOTYPE_MOCKS.filter((issue) => issue.id !== "conflict"),
}: {
  issues?: SyncIssuePrototype[];
}) {
  return (
    <section
      className="settings-sync-issues"
      aria-label="Other sync resolution layouts"
    >
      <header className="settings-sync-issues__header">
        <h3 className="settings-sync-issues__title">
          Other sync resolution layouts
        </h3>
        <p className="settings-sync-issues__lede">
          Static mock screens for layouts without a live data source yet.
        </p>
      </header>

      <div className="settings-sync-issues__stack">
        {issues.map((issue) => (
          <article
            key={issue.id}
            className={[
              "settings-sync-resolve",
              `settings-sync-resolve--${issue.tone}`,
            ].join(" ")}
          >
            <header className="settings-sync-resolve__header">
              <span
                className={[
                  "settings-sync-issue__badge",
                  badgeClassForTone(issue.tone),
                ].join(" ")}
              >
                {issue.badge}
              </span>
              <div className="settings-sync-resolve__titles">
                <h4 className="settings-sync-resolve__title">{issue.title}</h4>
                <p className="settings-sync-resolve__detail">{issue.detail}</p>
              </div>
            </header>
            <div className="settings-sync-resolve__body">
              <MockIssueBody id={issue.id} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Live single-issue resolve layout used by the Syncing workbench. */
export function SyncIssueResolveDetail({
  issue,
  actions,
  onDismissed,
  onActionSucceeded,
  onFailed,
}: {
  issue: SyncIssueInstance;
  actions?: SyncIssueResolveActions;
  onDismissed?: (message: string) => void;
  onActionSucceeded?: (message: string) => void;
  onFailed?: (message: string) => void;
}) {
  return (
    <article
      className={[
        "settings-sync-resolve",
        "settings-sync-resolve--detail",
        `settings-sync-resolve--${issue.tone}`,
      ].join(" ")}
      id={`sync-issue-${issue.id}`}
    >
      <header className="settings-sync-resolve__header">
        <span
          className={[
            "settings-sync-issue__badge",
            badgeClassForTone(issue.tone),
          ].join(" ")}
        >
          {issue.badge}
        </span>
        <div className="settings-sync-resolve__titles">
          <h4 className="settings-sync-resolve__title">{issue.title}</h4>
          <p className="settings-sync-resolve__detail">{issue.detail}</p>
        </div>
      </header>

      <div className="settings-sync-resolve__body">
        <LiveIssueBody
          issue={issue}
          actions={actions}
          onDismissed={onDismissed}
          onActionSucceeded={onActionSucceeded}
          onFailed={onFailed}
        />
      </div>
    </article>
  );
}

function LiveIssueBody({
  issue,
  actions,
  onDismissed,
  onActionSucceeded,
  onFailed,
}: {
  issue: SyncIssueInstance;
} & ResolveCallbacks) {
  switch (issue.payload.kind) {
    case "offline":
      return (
        <OfflineLayout
          lastSyncedLabel={issue.payload.lastSyncedLabel}
          queuedWrites={issue.payload.queuedWrites}
          onDismissed={onDismissed}
          onActionSucceeded={onActionSucceeded}
          onFailed={onFailed}
        />
      );
    case "connecting":
      return <ConnectingLayout onDismissed={onDismissed} />;
    case "powersync-error":
      return (
        <PowerSyncErrorLayout
          code={issue.payload.code}
          endpoint={issue.payload.endpoint}
          log={issue.payload.log}
          actions={actions}
          onDismissed={onDismissed}
          onActionSucceeded={onActionSucceeded}
          onFailed={onFailed}
        />
      );
    case "upload-stuck":
      return (
        <UploadQueueLayout
          items={issue.payload.items}
          uploadError={issue.payload.uploadError}
          actions={actions}
          onDismissed={onDismissed}
          onActionSucceeded={onActionSucceeded}
          onFailed={onFailed}
        />
      );
    case "dead-letter":
      return (
        <DeadLetterLayout
          letters={issue.payload.letters}
          count={issue.payload.count}
          actions={actions}
          onDismissed={onDismissed}
          onActionSucceeded={onActionSucceeded}
          onFailed={onFailed}
        />
      );
    case "peer-down":
      return (
        <PeerDownLayout
          peerHint={issue.payload.peerHint}
          lastError={issue.payload.lastError}
          actions={actions}
          onDismissed={onDismissed}
          onActionSucceeded={onActionSucceeded}
          onFailed={onFailed}
        />
      );
    case "twin-lag":
      return (
        <TwinLagLayout
          mismatches={issue.payload.mismatches}
          actions={actions}
          onDismissed={onDismissed}
          onActionSucceeded={onActionSucceeded}
          onFailed={onFailed}
        />
      );
    case "version-drift":
      return (
        <VersionDriftLayout
          localCommit={issue.payload.localCommit}
          peerCommit={issue.payload.peerCommit}
          updateHint={issue.payload.updateHint}
          onDismissed={onDismissed}
        />
      );
  }
}

function OfflineLayout({
  lastSyncedLabel,
  queuedWrites,
  onDismissed,
  onActionSucceeded,
  onFailed,
}: {
  lastSyncedLabel: string;
  queuedWrites: number;
} & ResolveCallbacks) {
  const [status, setStatus] = useState<"idle" | "trying" | "still-offline">(
    "idle",
  );
  return (
    <>
      <div className="settings-sync-resolve__panel">
        <dl className="settings-sync-resolve__facts">
          <div>
            <dt>Link</dt>
            <dd>Disconnected</dd>
          </div>
          <div>
            <dt>Last synced</dt>
            <dd>{lastSyncedLabel}</dd>
          </div>
          <div>
            <dt>Queued writes</dt>
            <dd>{queuedWrites}</dd>
          </div>
        </dl>
        {status === "trying" ? (
          <p className="settings-sync-resolve__pulse" role="status">
            Looking for a network…
          </p>
        ) : null}
        {status === "still-offline" ? (
          <p className="settings-sync-resolve__note" role="status">
            Still offline — queue unchanged.
          </p>
        ) : null}
      </div>
      <ResolveActions
        primary="Retry connection"
        secondary="Dismiss"
        busy={status === "trying"}
        onPrimary={() => {
          setStatus("trying");
          window.setTimeout(() => {
            if (navigator.onLine) {
              onActionSucceeded?.("Network is back — rechecking sync.");
              return;
            }
            setStatus("still-offline");
            onFailed?.("Still offline — could not reach the network.");
          }, 800);
        }}
        onSecondary={() => onDismissed?.("Offline notice dismissed.")}
      />
    </>
  );
}

function ConnectingLayout({ onDismissed }: ResolveCallbacks) {
  return (
    <>
      <div className="settings-sync-resolve__panel settings-sync-resolve__panel--center">
        <div className="settings-sync-resolve__spinner" aria-hidden="true" />
        <p className="settings-sync-resolve__pulse">Opening sync channel…</p>
        <div className="settings-sync-resolve__progress" aria-hidden="true">
          <span />
        </div>
      </div>
      <ResolveActions
        primary="Dismiss"
        onPrimary={() => onDismissed?.("Connecting notice dismissed.")}
      />
    </>
  );
}

function PowerSyncErrorLayout({
  code,
  endpoint,
  log,
  actions,
  onDismissed,
  onActionSucceeded,
  onFailed,
}: {
  code: string;
  endpoint: string;
  log: string;
} & ResolveCallbacks) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="settings-sync-resolve__panel">
        <dl className="settings-sync-resolve__facts">
          <div>
            <dt>Code</dt>
            <dd>
              <code>{code}</code>
            </dd>
          </div>
          <div>
            <dt>Endpoint</dt>
            <dd>
              <code>{endpoint}</code>
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className="settings-sync-resolve__disclosure"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"} diagnostics
        </button>
        {open ? <pre className="settings-sync-resolve__log">{log}</pre> : null}
      </div>
      <ResolveActions
        primary="Retry"
        secondary="Dismiss"
        busy={busy}
        onPrimary={() => {
          setBusy(true);
          void (async () => {
            try {
              await actions?.retryPowerSync?.();
              onActionSucceeded?.("PowerSync retry requested.");
            } catch (error) {
              onFailed?.(
                error instanceof Error
                  ? error.message
                  : "PowerSync retry failed.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
        onSecondary={() => onDismissed?.("PowerSync error dismissed.")}
      />
    </>
  );
}

function UploadQueueLayout({
  items,
  uploadError,
  actions,
  onDismissed,
  onActionSucceeded,
  onFailed,
}: {
  items: SyncUploadQueueItem[];
  uploadError: string | null;
} & ResolveCallbacks) {
  const [selected, setSelected] = useState<string[]>(() =>
    items.slice(0, 1).map((item) => item.id),
  );
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  };
  return (
    <>
      <div className="settings-sync-resolve__panel">
        {uploadError ? (
          <p className="settings-sync-resolve__note" role="status">
            {uploadError}
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="settings-sync-resolve__note">
            No pending CRUD rows right now — upload error may still need a
            retry.
          </p>
        ) : (
          <ul className="settings-sync-resolve__queue">
            {items.map((item) => {
              const checked = selected.includes(item.id);
              return (
                <li key={item.id}>
                  <label className="settings-sync-resolve__queue-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item.id)}
                    />
                    <span className="settings-sync-resolve__queue-main">
                      <span className="settings-sync-resolve__queue-label">
                        {item.label}
                      </span>
                      <span className="settings-sync-resolve__queue-meta">
                        {item.op} · {item.age}
                      </span>
                    </span>
                    <span
                      className={[
                        "settings-sync-resolve__pill",
                        item.status === "retrying" || item.status === "failed"
                          ? "settings-sync-resolve__pill--warn"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {item.status}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ResolveActions
        primary="Retry upload"
        secondary="Dismiss"
        busy={busy}
        onPrimary={() => {
          setBusy(true);
          void (async () => {
            try {
              const uploaded = await actions?.flushUploads?.();
              if (uploaded) {
                onActionSucceeded?.("Upload queue flushed.");
              } else {
                onFailed?.(
                  "Nothing uploaded — queue may still be empty or blocked.",
                );
              }
            } catch (error) {
              onFailed?.(
                error instanceof Error ? error.message : "Upload retry failed.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
        onSecondary={() => onDismissed?.("Upload notice dismissed.")}
      />
    </>
  );
}

function DeadLetterLayout({
  letters,
  count,
  actions,
  onActionSucceeded,
  onFailed,
}: {
  letters: ReplicationDeadLetter[];
  count: number;
} & ResolveCallbacks) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const letter = letters[Math.min(index, Math.max(letters.length - 1, 0))];
  if (!letter) {
    return (
      <p className="settings-hint">
        {count > 0
          ? `${count} open letters (details unavailable).`
          : "No open replication dead letters."}
      </p>
    );
  }
  return (
    <>
      <div className="settings-sync-resolve__panel">
        {letters.length > 1 ? (
          <div className="settings-sync-conflict__pager" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="settings-sync-conflict__pager-btn"
              disabled={busy || index <= 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              ‹
            </button>
            <span className="settings-sync-conflict__pager-label">
              {index + 1} / {letters.length}
              {count > letters.length ? ` · ${count} open` : ""}
            </span>
            <button
              type="button"
              className="settings-sync-conflict__pager-btn"
              disabled={busy || index >= letters.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              ›
            </button>
          </div>
        ) : null}
        <dl className="settings-sync-resolve__facts">
          <div>
            <dt>Table</dt>
            <dd>
              <code>{letter.tableName}</code>
            </dd>
          </div>
          <div>
            <dt>Direction</dt>
            <dd>{letter.direction || "—"}</dd>
          </div>
          <div>
            <dt>Error</dt>
            <dd>
              <code>{letter.errorCode ?? "apply_error"}</code>
            </dd>
          </div>
          <div>
            <dt>Attempts</dt>
            <dd>
              {letter.attempts} · next{" "}
              {formatDeadLetterNextRetry(letter.nextRetryAt)}
            </dd>
          </div>
          <div>
            <dt>Row</dt>
            <dd>
              <code>{letter.rowId || "—"}</code>
            </dd>
          </div>
        </dl>
        <p className="settings-sync-resolve__note">
          {letter.errorMessage || "Unknown apply error"}
        </p>
      </div>
      <ResolveActions
        primary="Retry apply"
        secondary="Acknowledge"
        busy={busy}
        onPrimary={() => {
          setBusy(true);
          void (async () => {
            try {
              await actions?.retryDeadLetter?.(letter.id);
              onActionSucceeded?.(
                `Dead letter retry queued for ${letter.tableName}.`,
              );
            } catch (error) {
              onFailed?.(
                error instanceof Error ? error.message : "Retry failed.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
        onSecondary={() => {
          setBusy(true);
          void (async () => {
            try {
              await actions?.acknowledgeDeadLetter?.(letter.id);
              onActionSucceeded?.(
                `Dead letter acknowledged for ${letter.tableName}.`,
              );
            } catch (error) {
              onFailed?.(
                error instanceof Error
                  ? error.message
                  : "Acknowledge failed.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
    </>
  );
}

function PeerDownLayout({
  peerHint,
  lastError,
  actions,
  onDismissed,
  onActionSucceeded,
  onFailed,
}: {
  peerHint: string;
  lastError: string;
} & ResolveCallbacks) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="settings-sync-resolve__panel">
        <dl className="settings-sync-resolve__facts">
          <div>
            <dt>Check</dt>
            <dd>
              <code>{peerHint}</code>
            </dd>
          </div>
          <div>
            <dt>Last error</dt>
            <dd>{lastError}</dd>
          </div>
        </dl>
      </div>
      <ResolveActions
        primary="Test again"
        secondary="Dismiss"
        busy={busy}
        onPrimary={() => {
          setBusy(true);
          void (async () => {
            try {
              await actions?.refresh?.();
              onActionSucceeded?.("Sync health refreshed.");
            } catch (error) {
              onFailed?.(
                error instanceof Error ? error.message : "Peer still unreachable.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
        onSecondary={() => onDismissed?.("Peer notice dismissed.")}
      />
    </>
  );
}

function TwinLagLayout({
  mismatches,
  actions,
  onDismissed,
  onActionSucceeded,
  onFailed,
}: {
  mismatches: SyncReconcileMismatch[];
} & ResolveCallbacks) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="settings-sync-resolve__panel">
        {mismatches.map((row) => {
          const totalGap = row.missingLocally + row.missingOnPeer;
          const width = Math.max(
            8,
            Math.min(100, 100 - Math.min(totalGap, 40) * 2),
          );
          return (
            <div key={row.tableName} className="settings-sync-resolve__lag">
              <div className="settings-sync-resolve__lag-head">
                <span>{row.tableName}</span>
                <span>
                  local {row.localCount} · peer {row.peerCount}
                </span>
              </div>
              <div
                className="settings-sync-resolve__lag-track"
                aria-hidden="true"
              >
                <span style={{ width: `${width}%` }} />
              </div>
              <p className="settings-sync-resolve__note">
                Missing locally {row.missingLocally} · missing on peer{" "}
                {row.missingOnPeer}
              </p>
            </div>
          );
        })}
      </div>
      <ResolveActions
        primary="Refresh status"
        secondary="Dismiss"
        busy={busy}
        onPrimary={() => {
          setBusy(true);
          void (async () => {
            try {
              await actions?.refresh?.();
              onActionSucceeded?.("Replication status refreshed.");
            } catch (error) {
              onFailed?.(
                error instanceof Error ? error.message : "Refresh failed.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
        onSecondary={() => onDismissed?.("Lag notice dismissed.")}
      />
    </>
  );
}

function MockIssueBody({ id }: { id: SyncIssueLayoutId }) {
  switch (id) {
    case "offline":
      return (
        <OfflineLayout
          lastSyncedLabel="Today · 09:12"
          queuedWrites={3}
        />
      );
    case "connecting":
      return <ConnectingLayout />;
    case "powersync-error":
      return (
        <PowerSyncErrorLayout
          code="token_exchange_failed"
          endpoint="/api/v1/powersync/token"
          log="[desktop] PowerSync init failed"
        />
      );
    case "upload-stuck":
      return (
        <UploadQueueLayout items={UPLOAD_QUEUE_MOCK} uploadError={null} />
      );
    case "dead-letter":
      return (
        <DeadLetterLayout
          letters={[
            {
              id: "mock",
              tableName: DEAD_LETTER_MOCK.table,
              rowId: DEAD_LETTER_MOCK.rowId,
              direction: DEAD_LETTER_MOCK.direction,
              errorCode: DEAD_LETTER_MOCK.errorCode,
              errorMessage: DEAD_LETTER_MOCK.errorMessage,
              attempts: DEAD_LETTER_MOCK.attempts,
              firstSeenAt: "",
              lastSeenAt: "",
              nextRetryAt: "",
            },
          ]}
          count={1}
        />
      );
    case "peer-down":
      return (
        <PeerDownLayout
          peerHint="http://100.x.x.x:8788"
          lastError="No route to host"
        />
      );
    case "twin-lag":
      return (
        <TwinLagLayout
          mismatches={[
            {
              tableName: "meeting_scheduling_settings",
              localCount: 1,
              peerCount: 1,
              missingLocally: 0,
              missingOnPeer: 0,
              checkedAt: "",
            },
          ]}
        />
      );
    case "vault-failed":
      return <StaticVaultFailed />;
    case "missing-blob":
      return <StaticMissingBlob />;
    case "draft-protected":
      return <StaticDraftProtected />;
    case "version-drift":
      return <StaticVersionDrift />;
    case "validation-rejected":
      return <StaticValidationRejected />;
    case "conflict":
      return null;
  }
}

function StaticVaultFailed() {
  return (
    <>
      <div className="settings-sync-resolve__panel">
        <dl className="settings-sync-resolve__facts">
          <div>
            <dt>Path</dt>
            <dd>
              <code>Projects/OS/vault-sync.md</code>
            </dd>
          </div>
        </dl>
      </div>
      <ResolveActions primary="Retry vault" secondary="Dismiss" />
    </>
  );
}

function StaticMissingBlob() {
  return (
    <>
      <div className="settings-sync-resolve__panel settings-sync-resolve__blob">
        <div className="settings-sync-resolve__blob-preview" aria-hidden="true">
          <span>PDF</span>
          <span>Unavailable</span>
        </div>
      </div>
      <ResolveActions primary="Retry download" secondary="Dismiss" />
    </>
  );
}

function StaticDraftProtected() {
  const draft = DRAFT_PROTECTED_MOCK;
  return (
    <>
      <div className="settings-sync-resolve__compare">
        <div className="settings-sync-resolve__compare-col">
          <span className="settings-sync-resolve__compare-label">Your draft</span>
          <p className="settings-sync-resolve__excerpt">{draft.localExcerpt}</p>
        </div>
        <div className="settings-sync-resolve__compare-col is-server">
          <span className="settings-sync-resolve__compare-label">
            Remote · {draft.remoteAt}
          </span>
          <p className="settings-sync-resolve__excerpt">{draft.remoteExcerpt}</p>
        </div>
      </div>
      <ResolveActions primary="Apply choice" secondary="Keep editing" />
    </>
  );
}

function VersionDriftLayout({
  localCommit,
  peerCommit,
  updateHint,
  onDismissed,
}: {
  localCommit: string;
  peerCommit: string;
  updateHint: string;
} & ResolveCallbacks) {
  return (
    <>
      <div className="settings-sync-resolve__compare">
        <div className="settings-sync-resolve__compare-col">
          <span className="settings-sync-resolve__compare-label">
            This Mac · local-core
          </span>
          <p>
            Commit <code>{localCommit}</code>
          </p>
        </div>
        <div className="settings-sync-resolve__compare-col is-server">
          <span className="settings-sync-resolve__compare-label">
            Peer · cloud-core
          </span>
          <p>
            Commit <code>{peerCommit}</code>
          </p>
        </div>
      </div>
      <p className="settings-sync-resolve__note">{updateHint}</p>
      <ResolveActions
        primary="Dismiss"
        onPrimary={() => onDismissed?.("Version drift notice dismissed.")}
      />
    </>
  );
}

function StaticVersionDrift() {
  const { local, cloud } = VERSION_DRIFT_MOCK;
  return (
    <VersionDriftLayout
      localCommit={local.commit}
      peerCommit={cloud.commit}
      updateHint="Run scripts/local-core/update-build.sh after the cloud deploy."
    />
  );
}

function StaticValidationRejected() {
  return (
    <>
      <div className="settings-sync-resolve__compare">
        <div className="settings-sync-resolve__compare-col">
          <span className="settings-sync-resolve__compare-label">Your write</span>
          <p>
            Contact <strong>CON-441</strong>
          </p>
        </div>
        <div className="settings-sync-resolve__compare-col is-server">
          <span className="settings-sync-resolve__compare-label">
            Server kept
          </span>
          <p>
            Email → <code>sam@acme.example</code>
          </p>
        </div>
      </div>
      <ResolveActions primary="Open contact" secondary="Dismiss" />
    </>
  );
}

function ResolveActions({
  primary,
  secondary,
  onPrimary,
  onSecondary,
  primaryDisabled = false,
  busy = false,
}: {
  primary: string;
  secondary?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  primaryDisabled?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="settings-sync-resolve__actions">
      {secondary ? (
        <button
          type="button"
          className="settings-sync-issue__btn settings-sync-issue__btn--secondary"
          disabled={busy}
          onClick={onSecondary}
        >
          {secondary}
        </button>
      ) : null}
      <button
        type="button"
        className="settings-sync-issue__btn settings-sync-issue__btn--primary"
        disabled={primaryDisabled || busy}
        onClick={onPrimary}
      >
        {busy ? "Working…" : primary}
      </button>
    </div>
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
