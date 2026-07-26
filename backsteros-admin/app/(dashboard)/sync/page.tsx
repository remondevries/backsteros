"use client";

import { useEffect, useState } from "react";

import { useAdminApi } from "@/lib/api-context";

type SyncHealth = {
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

export default function SyncPage() {
  const { requestJson } = useAdminApi();
  const [health, setHealth] = useState<SyncHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void requestJson<SyncHealth>("/api/v1/ops/sync-health")
      .then((data) => {
        if (!cancelled) {
          setHealth(data);
          setError(null);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setHealth(null);
          setError(reason instanceof Error ? reason.message : String(reason));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestJson]);

  return (
    <div className="admin-page admin-page--wide">
      <header className="admin-page-header">
        <h1>Sync</h1>
        <p className="admin-muted">
          Workspace sync cursor, recent devices, and storage readiness.
        </p>
      </header>

      {loading ? <p className="admin-muted">Loading…</p> : null}
      {error ? (
        <div className="admin-card admin-card--error" role="alert">
          <strong>Sync health failed</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {health ? (
        <>
          <div className="admin-card">
            <dl className="admin-dl">
              <div>
                <dt>Workspace</dt>
                <dd>
                  <code>{health.workspaceId}</code>
                </dd>
              </div>
              <div>
                <dt>Cursor</dt>
                <dd>{health.cursor}</dd>
              </div>
              <div>
                <dt>Events (1h)</dt>
                <dd>{health.eventsLastHour}</dd>
              </div>
              <div>
                <dt>Spaces</dt>
                <dd>
                  {health.spacesConfigured ? "configured" : "not configured"}
                </dd>
              </div>
              <div>
                <dt>Failed pushes</dt>
                <dd>{health.failedPushes.length}</dd>
              </div>
            </dl>
          </div>

          <section className="admin-section">
            <h2>Devices</h2>
            {health.devices.length === 0 ? (
              <p className="admin-muted">No devices with sync events yet.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Last seen</th>
                      <th>Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.devices.map((device) => (
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
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
