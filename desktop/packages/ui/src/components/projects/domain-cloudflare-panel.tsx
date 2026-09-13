"use client";

import { useCallback, useEffect, useState } from "react";

export type DomainCloudflareDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number | null;
  proxied: boolean | null;
  priority: number | null;
};

export type DomainCloudflareDnsResult = {
  zoneId: string;
  records: DomainCloudflareDnsRecord[];
};

export type DomainCloudflarePanelProps = {
  zoneId: string;
  loadDnsRecords: (zoneId: string) => Promise<DomainCloudflareDnsResult>;
  purgeCache: (zoneId: string) => Promise<void>;
};

function formatTtl(ttl: number | null): string {
  if (ttl == null) return "—";
  if (ttl === 1) return "Auto";
  return `${ttl}s`;
}

/**
 * Cloudflare DNS + cache controls for Catalog Domains side panel.
 */
export function DomainCloudflarePanel({
  zoneId,
  loadDnsRecords,
  purgeCache,
}: DomainCloudflarePanelProps) {
  const [records, setRecords] = useState<DomainCloudflareDnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState<string | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadDnsRecords(zoneId);
      setRecords(next.records);
    } catch (err: unknown) {
      setRecords([]);
      setError(
        err instanceof Error ? err.message : "Could not load DNS records",
      );
    } finally {
      setLoading(false);
    }
  }, [loadDnsRecords, zoneId]);

  useEffect(() => {
    setPurgeMessage(null);
    setPurgeError(null);
    void reload();
  }, [reload]);

  async function handlePurge() {
    const confirmed = window.confirm(
      "Purge all Cloudflare cached files for this zone?",
    );
    if (!confirmed) return;
    setPurging(true);
    setPurgeMessage(null);
    setPurgeError(null);
    try {
      await purgeCache(zoneId);
      setPurgeMessage("Cache purged");
    } catch (err: unknown) {
      setPurgeError(
        err instanceof Error ? err.message : "Could not purge cache",
      );
    } finally {
      setPurging(false);
    }
  }

  return (
    <section
      className="entity-overview__details domain-cloudflare-panel"
      aria-label="Cloudflare"
    >
      <div className="domain-cloudflare-panel__toolbar">
        <button
          type="button"
          className="domain-overview__button"
          disabled={purging || loading}
          onClick={() => {
            void handlePurge();
          }}
        >
          {purging ? "Purging…" : "Purge cache"}
        </button>
        <button
          type="button"
          className="domain-overview__button"
          disabled={loading}
          onClick={() => {
            void reload();
          }}
        >
          Refresh
        </button>
      </div>
      {purgeMessage ? (
        <p className="domain-cloudflare-panel__ok">{purgeMessage}</p>
      ) : null}
      {purgeError ? (
        <p className="domain-overview__error">{purgeError}</p>
      ) : null}

      {loading ? (
        <p className="domain-overview__muted">Loading DNS records…</p>
      ) : null}
      {error ? <p className="domain-overview__error">{error}</p> : null}

      {!loading && !error ? (
        records.length === 0 ? (
          <p className="domain-overview__muted">No DNS records</p>
        ) : (
          <div className="domain-cloudflare-panel__table-wrap">
            <table className="domain-cloudflare-panel__table">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Name</th>
                  <th scope="col">Content</th>
                  <th scope="col">Proxy</th>
                  <th scope="col">TTL</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <span className="domain-cloudflare-panel__type">
                        {record.type}
                      </span>
                    </td>
                    <td className="domain-cloudflare-panel__name">
                      {record.name}
                    </td>
                    <td className="domain-cloudflare-panel__content">
                      {record.priority != null
                        ? `${record.priority} ${record.content}`
                        : record.content}
                    </td>
                    <td>
                      {record.proxied == null
                        ? "—"
                        : record.proxied
                          ? "On"
                          : "Off"}
                    </td>
                    <td>{formatTtl(record.ttl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </section>
  );
}
