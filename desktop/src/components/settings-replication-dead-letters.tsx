import { ApiClientError } from "@backsteros/api-client";
import { useCallback, useEffect, useState } from "react";

import { useDesktopApi } from "../lib/api-context";
import {
  formatDeadLetterNextRetry,
  formatDeadLetterTimestamp,
  OPS_SYNC_HEALTH_PATH,
  parseOpsSyncHealthDeadLetters,
  replicationDeadLetterAcknowledgePath,
  replicationDeadLetterRetryPath,
  type ReplicationDeadLetter,
} from "../lib/replication-dead-letters";

export function SettingsReplicationDeadLettersSection() {
  const { client } = useDesktopApi();
  const [count, setCount] = useState(0);
  const [letters, setLetters] = useState<ReplicationDeadLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setErrorMessage(null);
    try {
      const body = await client.requestJson<unknown>(OPS_SYNC_HEALTH_PATH);
      const parsed = parseOpsSyncHealthDeadLetters(body);
      setCount(parsed.count);
      setLetters(parsed.letters);
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.status === 401 || error.status === 403
            ? "Owner session required to view replication dead letters."
            : error.message
          : error instanceof Error
            ? error.message
            : "Could not load replication health.";
      setErrorMessage(message);
      setCount(0);
      setLetters([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (id: string, path: string) => {
      setBusyId(id);
      setErrorMessage(null);
      try {
        await client.requestJson(path, { method: "POST" });
        await load({ silent: true });
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Action failed.",
        );
      } finally {
        setBusyId(null);
      }
    },
    [client, load],
  );

  return (
    <section className="settings-card">
      <h2>Replication dead letters</h2>
      <p>
        Failed twin-apply rows stay here so one bad unique/FK error cannot stall
        sync. Retry applies the stored payload now. Acknowledge closes the
        letter without applying it. Unresolved letters should pause sync-event
        pull until they are cleared.
      </p>

      {loading ? (
        <p className="settings-hint">Loading…</p>
      ) : errorMessage ? (
        <p className="settings-hint" role="alert">
          {errorMessage}
        </p>
      ) : letters.length === 0 ? (
        <p className="settings-hint">
          {count > 0
            ? `${count} open letters (list truncated).`
            : "No open replication dead letters."}
        </p>
      ) : (
        <>
          {count > letters.length ? (
            <p className="settings-hint">
              Showing {letters.length} of {count} open letters.
            </p>
          ) : null}
          <div className="settings-dead-letters">
            {letters.map((letter) => {
              const busy = busyId === letter.id;
              return (
                <article key={letter.id} className="settings-dead-letter">
                  <header className="settings-dead-letter__head">
                    <strong>{letter.tableName}</strong>
                    <span>{letter.direction}</span>
                  </header>
                  <p className="settings-dead-letter__reason">
                    {letter.errorCode ? `${letter.errorCode}: ` : null}
                    {letter.errorMessage || "Unknown apply error"}
                  </p>
                  <dl className="settings-sync-status">
                    <div>
                      <dt>Row</dt>
                      <dd>
                        <code>{letter.rowId || "—"}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatDeadLetterTimestamp(letter.firstSeenAt)}</dd>
                    </div>
                    <div>
                      <dt>Attempts</dt>
                      <dd>{letter.attempts}</dd>
                    </div>
                    <div>
                      <dt>Next retry</dt>
                      <dd>{formatDeadLetterNextRetry(letter.nextRetryAt)}</dd>
                    </div>
                  </dl>
                  <div className="settings-dead-letter__actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          letter.id,
                          replicationDeadLetterRetryPath(letter.id),
                        )
                      }
                    >
                      {busy ? "Working…" : "Retry now"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Acknowledge this ${letter.tableName} dead letter without applying the row?`,
                          )
                        ) {
                          return;
                        }
                        void runAction(
                          letter.id,
                          replicationDeadLetterAcknowledgePath(letter.id),
                        );
                      }}
                    >
                      Acknowledge
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
