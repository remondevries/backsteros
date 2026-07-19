import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { useAdminApi } from "./lib/providers";

type HealthResponse = {
  ok: boolean;
  service: string;
  version: string;
  spacesConfigured: boolean;
};

type SyncHealthResponse = {
  workspaceId: string;
  cursor: number;
  eventsLastHour: number;
  devices: Array<{
    deviceId: string;
    lastSeenAt: string;
    eventCount: number;
  }>;
  failedPushes: Array<{ id: string; at: string; message: string }>;
  spacesConfigured: boolean;
};

type OpsLogEntry = {
  id: string;
  at: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: string;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand">
          <strong>BacksterOS</strong>
          <span className="admin-brand-muted">Admin</span>
        </div>
        <nav className="admin-nav">
          <Link to="/">Health</Link>
          <Link to="/sync">Sync</Link>
          <Link to="/logs">Logs</Link>
          <a href="https://backsteros.com/app">Open app</a>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </nav>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}

function SignInGate() {
  return (
    <div className="admin-gate">
      <h1>BacksterOS Admin</h1>
      <p>Owner sign-in required for ops views.</p>
      <SignInButton mode="modal">
        <button type="button" className="admin-button">
          Sign in
        </button>
      </SignInButton>
    </div>
  );
}

function HealthPage() {
  const { apiUrl, requestJson } = useAdminApi();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void requestJson<HealthResponse>("/health")
      .then((data) => {
        if (!cancelled) {
          setHealth(data);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setHealth(null);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestJson]);

  return (
    <Shell>
      <h1>API health</h1>
      <p className="admin-muted">
        Probe <code>{apiUrl}/health</code>
      </p>
      {loading ? <p>Loading…</p> : null}
      {error ? (
        <div className="admin-card admin-card--error" role="alert">
          <strong>Health check failed</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {health ? (
        <div className="admin-card">
          <dl className="admin-dl">
            <div>
              <dt>Status</dt>
              <dd>{health.ok ? "ok" : "degraded"}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{health.service}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{health.version}</dd>
            </div>
            <div>
              <dt>Spaces</dt>
              <dd>{health.spacesConfigured ? "configured" : "not configured"}</dd>
            </div>
          </dl>
          <p className="admin-muted">
            OpenAPI:{" "}
            <a href={`${apiUrl}/api/v1/openapi.json`} target="_blank" rel="noreferrer">
              {apiUrl}/api/v1/openapi.json
            </a>
          </p>
        </div>
      ) : null}
    </Shell>
  );
}

function SyncPage() {
  const { requestJson } = useAdminApi();
  const [data, setData] = useState<SyncHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void requestJson<SyncHealthResponse>("/api/v1/ops/sync-health")
        .then((payload) => {
          if (!cancelled) {
            setData(payload);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setData(null);
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [requestJson]);

  return (
    <Shell>
      <h1>Sync health</h1>
      <p className="admin-muted">
        Workspace sync cursor, recent devices from <code>sync_events</code>.
        Refreshes every 15s.
      </p>
      {loading && !data ? <p>Loading…</p> : null}
      {error ? (
        <div className="admin-card admin-card--error" role="alert">
          <strong>Sync health failed</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {data ? (
        <>
          <div className="admin-card">
            <dl className="admin-dl">
              <div>
                <dt>Workspace</dt>
                <dd>
                  <code>{data.workspaceId}</code>
                </dd>
              </div>
              <div>
                <dt>Cursor</dt>
                <dd>{data.cursor}</dd>
              </div>
              <div>
                <dt>Events (1h)</dt>
                <dd>{data.eventsLastHour}</dd>
              </div>
              <div>
                <dt>Spaces</dt>
                <dd>{data.spacesConfigured ? "configured" : "not configured"}</dd>
              </div>
              <div>
                <dt>Failed pushes</dt>
                <dd>
                  {data.failedPushes.length === 0
                    ? "none tracked (see Logs)"
                    : data.failedPushes.length}
                </dd>
              </div>
            </dl>
          </div>
          <div className="admin-card">
            <h2 className="admin-h2">Devices</h2>
            {data.devices.length === 0 ? (
              <p className="admin-muted">No device ids recorded yet.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Last seen</th>
                    <th>Events</th>
                  </tr>
                </thead>
                <tbody>
                  {data.devices.map((device) => (
                    <tr key={device.deviceId}>
                      <td>
                        <code>{device.deviceId}</code>
                      </td>
                      <td>{new Date(device.lastSeenAt).toLocaleString()}</td>
                      <td>{device.eventCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </Shell>
  );
}

function LogsPage() {
  const { requestJson } = useAdminApi();
  const [logs, setLogs] = useState<OpsLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void requestJson<{ logs: OpsLogEntry[] }>("/api/v1/ops/logs?limit=100")
        .then((payload) => {
          if (!cancelled) {
            setLogs(payload.logs);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setLogs([]);
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const timer = window.setInterval(load, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [requestJson]);

  return (
    <Shell>
      <h1>Log tail</h1>
      <p className="admin-muted">
        In-process ring buffer (console.error / warn + markers). Refreshes every
        5s. Not durable across restarts.
      </p>
      {loading && logs.length === 0 ? <p>Loading…</p> : null}
      {error ? (
        <div className="admin-card admin-card--error" role="alert">
          <strong>Log tail failed</strong>
          <p>{error}</p>
        </div>
      ) : null}
      <div className="admin-card admin-log-list">
        {logs.length === 0 ? (
          <p className="admin-muted">No log entries yet.</p>
        ) : (
          logs.map((entry) => (
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
              <pre>{entry.message}</pre>
              {entry.detail ? <pre className="admin-log-detail">{entry.detail}</pre> : null}
            </article>
          ))
        )}
      </div>
    </Shell>
  );
}

export function App() {
  return (
    <>
      <SignedOut>
        <SignInGate />
      </SignedOut>
      <SignedIn>
        <Routes>
          <Route path="/" element={<HealthPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SignedIn>
    </>
  );
}
