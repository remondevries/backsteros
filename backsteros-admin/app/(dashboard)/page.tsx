"use client";

import { useEffect, useState } from "react";

import { useAdminApi } from "@/lib/api-context";

type HealthResponse = {
  ok: boolean;
  service: string;
  version: string;
  spacesConfigured: boolean;
};

export default function DashboardPage() {
  const { apiUrl, requestJson } = useAdminApi();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void requestJson<HealthResponse>("/api/health")
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
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Dashboard</h1>
        <p className="admin-muted">
          Ops overview. Probe <code>{apiUrl}/health</code> via same-origin{" "}
          <code>/api/health</code>
        </p>
      </header>

      {loading ? <p className="admin-muted">Loading…</p> : null}
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
              <dd>
                {health.spacesConfigured ? "configured" : "not configured"}
              </dd>
            </div>
          </dl>
          <p className="admin-muted">
            OpenAPI:{" "}
            <a
              href={`${apiUrl}/api/v1/openapi.json`}
              target="_blank"
              rel="noreferrer"
            >
              {apiUrl}/api/v1/openapi.json
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
