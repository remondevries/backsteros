import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AutoReviewWebhookSettings,
  AutoReviewWebhookTestResult,
} from "@backsteros/contracts";
import {
  SegmentedPillToggle,
  SettingsTestConnectionSwap,
  useIntegrationSettingsHeaderTrailing,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import {
  settingsSecretInputClassName,
  settingsSecretPlaceholder,
} from "../lib/settings-secret-field";

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

type AutoReviewSubTab = "api-key" | "last-delivery" | "recent-failures";

const AUTO_REVIEW_SUB_TABS: { value: AutoReviewSubTab; label: string }[] = [
  { value: "api-key", label: "API key" },
  { value: "last-delivery", label: "Last delivery" },
  { value: "recent-failures", label: "Recent failures" },
];

export function SettingsAutoReviewWebhookTab(props: {
  title?: string;
  description?: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [subTab, setSubTab] = useState<AutoReviewSubTab>("api-key");
  const [settings, setSettings] = useState<AutoReviewWebhookSettings | null>(
    null,
  );
  const [urlDraft, setUrlDraft] = useState("");
  const [secretDraft, setSecretDraft] = useState("");
  const [authorizationDraft, setAuthorizationDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] =
    useState<AutoReviewWebhookTestResult | null>(null);

  const load = useCallback(async () => {
    const next = await client.requestJson<AutoReviewWebhookSettings>(
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
    authorizationHeader?: string;
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
      setAuthorizationDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    urlDraft.trim() !== "" ||
    secretDraft.trim() !== "" ||
    authorizationDraft.trim() !== "";

  const canTest =
    Boolean(settings?.enabled) &&
    Boolean(settings?.url) &&
    Boolean(settings?.secretConfigured);

  const headerTrailing = useMemo(
    () => (
      <SegmentedPillToggle
        ariaLabel="Auto-review webhook sections"
        value={subTab}
        onChange={setSubTab}
        options={AUTO_REVIEW_SUB_TABS}
      />
    ),
    [subTab],
  );
  useIntegrationSettingsHeaderTrailing(headerTrailing);

  return (
    <>
      {props.hideHeader ? null : (
        <>
          <h2>{props.title ?? "Auto-review webhook"}</h2>
          <p>
            {props.description ??
              "Signed webhook to Sander when a task with Automate completion moves to In Review."}
          </p>
        </>
      )}
      {error ? <p className="settings-cursor-error">{error}</p> : null}

      {subTab === "api-key" ? (
        <section className="settings-card settings-card--bare">
          <h2>API key</h2>
          <p>
            POST JSON to this URL when an agent turn finishes and the task is In
            Review. The HMAC secret and optional Authorization header are stored
            encrypted and never returned.
          </p>
          <label className="settings-field">
            Webhook URL
            <div className="settings-secret-field-row">
              <div className="settings-secret-field-row__control">
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={settings?.url ?? "https://…"}
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.target.value)}
                />
                <SettingsTestConnectionSwap
                  disabled={saving || !canTest}
                  idleLabel="Send test"
                  successLabel="Sent"
                  onTest={async () => {
                    setError(null);
                    const result =
                      await client.requestJson<AutoReviewWebhookTestResult>(
                        "/api/v1/settings/auto-review-webhook/test",
                        { method: "POST" },
                      );
                    setTestResult(result);
                    await load();
                    if (!result.ok) {
                      throw new Error(result.error ?? "Test failed");
                    }
                  }}
                />
              </div>
              <div className="settings-secret-field-row__actions">
                <button
                  type="button"
                  disabled={saving || !canSave}
                  onClick={() =>
                    void save({
                      ...(urlDraft.trim() ? { url: urlDraft.trim() } : {}),
                      ...(secretDraft.trim() ? { secret: secretDraft } : {}),
                      ...(authorizationDraft.trim()
                        ? { authorizationHeader: authorizationDraft.trim() }
                        : {}),
                    })
                  }
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </label>
          <label className="settings-field">
            Signing secret (HMAC)
            <div className="settings-secret-field-row">
              <input
                type="password"
                autoComplete="off"
                className={settingsSecretInputClassName(
                  Boolean(settings?.secretConfigured),
                )}
                placeholder={
                  settings?.secretConfigured
                    ? settingsSecretPlaceholder(settings.secretPreview)
                    : "Shared secret for HMAC signature"
                }
                value={secretDraft}
                onChange={(event) => setSecretDraft(event.target.value)}
              />
            </div>
          </label>
          <label className="settings-field">
            Authorization header
            <div className="settings-secret-field-row">
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                className={settingsSecretInputClassName(
                  Boolean(settings?.authorizationHeaderConfigured),
                )}
                placeholder={
                  settings?.authorizationHeaderConfigured
                    ? settingsSecretPlaceholder(
                        settings.authorizationHeaderPreview,
                      )
                    : "Optional — e.g. Bearer <Grok Bot sender key>"
                }
                value={authorizationDraft}
                onChange={(event) => setAuthorizationDraft(event.target.value)}
              />
              {settings?.authorizationHeaderConfigured ? (
                <div className="settings-secret-field-row__actions">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save({ authorizationHeader: "" })}
                  >
                    Clear Authorization header
                  </button>
                </div>
              ) : null}
            </div>
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
        </section>
      ) : null}

      {subTab === "last-delivery" ? (
        <section className="settings-card settings-card--bare">
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
              Test: {testResult.ok ? "ok" : (testResult.error ?? "failed")}
              {testResult.httpStatus != null
                ? ` · HTTP ${testResult.httpStatus}`
                : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      {subTab === "recent-failures" ? (
        <section className="settings-card settings-card--bare">
          <h2>Recent failures</h2>
          {(settings?.recentFailures ?? []).length === 0 ? (
            <p className="settings-hint">No recent failures.</p>
          ) : (
            <ul className="settings-hint">
              {settings?.recentFailures.map((row) => (
                <li key={row.deliveryId}>
                  {formatDeliveryAt(row.at)} ·{" "}
                  {row.taskKey ?? row.taskId ?? "test"} · attempt {row.attempt}
                  {row.httpStatus != null ? ` · HTTP ${row.httpStatus}` : ""}
                  {row.error ? ` · ${row.error}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
