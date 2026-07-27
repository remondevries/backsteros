"use client";

import { useCallback, useEffect, useState } from "react";

import { useAdminApi } from "@/lib/api-context";

type OpsLog = {
  id: string;
  at: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: string;
};

export default function LogsPage() {
  const { requestJson } = useAdminApi();
  const [logs, setLogs] = useState<OpsLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      void requestJson<{ logs: OpsLog[] }>("/api/v1/ops/logs?limit=100")
        .then((data) => {
          setLogs(data.logs);
          setError(null);
          setLoading(false);
        })
        .catch((reason: unknown) => {
          setLogs([]);
          setError(reason instanceof Error ? reason.message : String(reason));
          setLoading(false);
        });
    },
    [requestJson],
  );

  useEffect(() => {
    let cancelled = false;
    void requestJson<{ logs: OpsLog[] }>("/api/v1/ops/logs?limit=100")
      .then((data) => {
        if (!cancelled) {
          setLogs(data.logs);
          setError(null);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLogs([]);
          setError(reason instanceof Error ? reason.message : String(reason));
          setLoading(false);
        }
      });

    const timer = window.setInterval(() => {
      void requestJson<{ logs: OpsLog[] }>("/api/v1/ops/logs?limit=100")
        .then((data) => {
          if (!cancelled) {
            setLogs(data.logs);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        });
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [requestJson]);

  return (
    <div className="admin-page admin-page--wide">
      <header className="admin-page-header admin-page-header--row">
        <div>
          <h1>Logs</h1>
          <p className="admin-muted">
            In-process API log tail (ring buffer). Refreshes every 15s.
          </p>
        </div>
        <button type="button" className="admin-button" onClick={() => refresh()}>
          Refresh
        </button>
      </header>

      {loading && logs.length === 0 ? (
        <p className="admin-muted">Loading…</p>
      ) : null}
      {error ? (
        <div className="admin-card admin-card--error" role="alert">
          <strong>Log fetch failed</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {logs.length > 0 ? (
        <div className="admin-log-list">
          {logs.map((entry) => (
            <article
              key={entry.id}
              className={`admin-log admin-log--${entry.level}`}
            >
              <header>
                <span className="admin-log-level">{entry.level}</span>
                <time dateTime={entry.at}>
                  {new Date(entry.at).toLocaleString()}
                </time>
              </header>
              <p>{entry.message}</p>
              {entry.detail ? (
                <pre className="admin-log-detail">{entry.detail}</pre>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {!loading && !error && logs.length === 0 ? (
        <p className="admin-muted">No log entries yet.</p>
      ) : null}
    </div>
  );
}
