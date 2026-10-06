import { useCallback, useEffect, useState } from "react";
import type {
  AutoReviewWebhookSettings,
  AutoReviewWebhookTestResult,
} from "@backsteros/contracts";
import { SegmentedPillToggle } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

function formatDeliveryAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SettingsAutoReviewWebhookTab(props: {
  title?: string;
  description?: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<AutoReviewWebhookSettings | null>(
    null,
  );
  const [urlDraft, setUrlDraft] = useState("");
  const [secretDraft, setSecretDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] =
    useState<AutoReviewWebhookTestResult | null>(null);

  const load = useCallback(async () => {
    const next =
      await client.requestJson<AutoReviewWebhookSettings>(
        "/api/v1/settings/auto-review-webhook",
      );
    setSettings(next);
  }, [client]);

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load settings");
    });
  }, [load]);

  async function save(patch: {
    url?: string;
    secret?: string;
    enabled?: boolean;
  }) {
    setSaving(true);
    setError(null);
    try {
      const next = await client.requestJson<AutoReviewWebhookSettings>(
        "/api/v1/settings/auto-review-webhook",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setSettings(next);
      setUrlDraft("");
      setSecretDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError(null);
    try {
      const result = await client.requestJson<AutoReviewWebhookTestResult>(
        "/api/v1/settings/auto-review-webhook/test",
        { method: "POST" },
      );
      setTestResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="settings-cursor-tab">
      {props.hideHeader ? null : (
        <>
          <h2>{props.title ?? "Auto-review webhook"}</h2>
          <p>
            {props.description ??
              "Signed webhook to Sander when a task with Automate completion moves to In Review."}
          </p>
        </>
      )}
      {error ? <p className="settings-hint">{error}</p> : null}
      <section className="settings-card">
        <h2>Auto-review webhook</h2>
        <p>
          POST JSON to this URL when an agent turn finishes and the task is In
          Review. The secret is stored encrypted and is never returned.
        </p>
        <label className="settings-field">
          Webhook URL
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={settings?.url ?? "https://…"}
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
          />
        </label>
        <label className="settings-field">
          Secret
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.secretConfigured
                ? `Configured (${settings.secretPreview ?? "••••"})`
                : "Shared secret for HMAC + Authorization"
            }
            value={secretDraft}
            onChange={(event) => setSecretDraft(event.target.value)}
          />
        </label>
        <div className="settings-field">
          <span>Enabled</span>
          <SegmentedPillToggle
            value={settings?.enabled ? "on" : "off"}
            options={[
              { value: "off", label: "Off" },
              { value: "on", label: "On" },
            ]}
            onChange={(value) => {
              void save({ enabled: value === "on" });
            }}
            ariaLabel="Auto-review webhook enabled"
            disabled={saving || settings === null}
          />
        </div>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={
              saving ||
              (!urlDraft.trim() && !secretDraft.trim())
            }
            onClick={() =>
              void save({
                ...(urlDraft.trim() ? { url: urlDraft.trim() } : {}),
                ...(secretDraft.trim() ? { secret: secretDraft } : {}),
              })
            }
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={
              testing ||
              saving ||
              !settings?.enabled ||
              !settings.url ||
              !settings.secretConfigured
            }
            onClick={() => void sendTest()}
          >
            {testing ? "Sending…" : "Send test"}
          </button>
        </div>
      </section>
      <section className="settings-card">
        <h2>Last delivery</h2>
        <p>
          {formatDeliveryAt(settings?.lastDeliveryAt ?? null)} ·{" "}
          {settings?.lastDeliveryResult ?? "none"}
          {settings?.lastDeliveryHttpStatus != null
            ? ` · HTTP ${settings.lastDeliveryHttpStatus}`
            : ""}
        </p>
        {settings?.lastDeliveryError ? (
          <p className="settings-hint">{settings.lastDeliveryError}</p>
        ) : null}
        {testResult ? (
          <p className="settings-hint">
            Test: {testResult.ok ? "ok" : testResult.error ?? "failed"}
            {testResult.httpStatus != null
              ? ` · HTTP ${testResult.httpStatus}`
              : ""}
          </p>
        ) : null}
      </section>
      <section className="settings-card">
        <h2>Recent failures</h2>
        {(settings?.recentFailures ?? []).length === 0 ? (
          <p className="settings-hint">No recent failures.</p>
        ) : (
          <ul className="settings-hint">
            {settings?.recentFailures.map((row) => (
              <li key={row.deliveryId}>
                {formatDeliveryAt(row.at)} · {row.taskKey ?? row.taskId ?? "test"}{" "}
                · attempt {row.attempt}
                {row.httpStatus != null ? ` · HTTP ${row.httpStatus}` : ""}
                {row.error ? ` · ${row.error}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
