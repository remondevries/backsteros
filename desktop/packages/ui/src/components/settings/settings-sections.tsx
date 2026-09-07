"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  APP_TIMEZONE_OPTIONS,
  normalizeAppTimezone,
} from "../../shared/app-timezone.js";
import { SettingsContentHeader } from "./settings-content-header.js";

export type GeneralSettingsSectionViewProps = {
  timezone: string;
  saving?: boolean;
  onTimezoneChange?: (timezone: string) => void | Promise<void>;
};

export function GeneralSettingsSectionView({
  timezone,
  saving = false,
  onTimezoneChange,
}: GeneralSettingsSectionViewProps) {
  const [value, setValue] = useState(() => normalizeAppTimezone(timezone));

  useEffect(() => {
    setValue(normalizeAppTimezone(timezone));
  }, [timezone]);

  return (
    <section className="settings-card">
      <h2>Timezone</h2>
      <p>
        Due dates, Today/Tomorrow task tabs, and journal due-task panels use
        this timezone — not your browser or server clock.
      </p>
      <label className="settings-field">
        <span>Timezone</span>
        <select
          value={value}
          disabled={saving || !onTimezoneChange}
          onChange={(event) => {
            const next = normalizeAppTimezone(event.target.value);
            setValue(next);
            void onTimezoneChange?.(next);
          }}
        >
          {APP_TIMEZONE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

export type AccountSettingsSectionViewProps = {
  email?: string | null;
  showEmail?: boolean;
  assigneeField?: ReactNode;
};

export function AccountSettingsSectionView({
  email,
  showEmail = true,
  assigneeField,
}: AccountSettingsSectionViewProps) {
  return (
    <>
      {showEmail ? (
        <section className="settings-card">
          <h2>Email</h2>
          <p>The email address associated with your account.</p>
          <div className="settings-field">
            <span className="settings-static-value">{email || "—"}</span>
          </div>
        </section>
      ) : null}
      <section className="settings-card">
        <h2>Default assignee</h2>
        <p>
          This contact is the default assignee for newly created tasks. You can
          still change the assignee on individual tasks.
        </p>
        {assigneeField ?? (
          <p className="settings-hint">
            Add a contact to set a default assignee.
          </p>
        )}
      </section>
    </>
  );
}

export type ComingSoonSettingsSectionViewProps = {
  title: string;
  body: string;
};

export function ComingSoonSettingsSectionView({
  title,
  body,
}: ComingSoonSettingsSectionViewProps) {
  return (
    <section className="settings-card settings-coming-soon-card">
      <h2>{title}</h2>
      <p>{body}</p>
      <p className="settings-coming-soon">Coming soon</p>
    </section>
  );
}

export type IntegrationConnectionSettingsViewProps = {
  title: string;
  headerDescription: string;
  body: ReactNode;
  connected?: boolean;
  statusLabel: string;
  secondaryLabel: string;
  secondaryValue: string;
  hint?: string | null;
  reason?: string | null;
  testing?: boolean;
  testMessage?: string | null;
  testOk?: boolean | null;
  onTestConnection?: () => void;
  testDisabled?: boolean;
};

export function IntegrationConnectionSettingsView({
  title,
  headerDescription,
  body,
  connected,
  statusLabel,
  secondaryLabel,
  secondaryValue,
  hint,
  reason,
  testing = false,
  testMessage,
  testOk,
  onTestConnection,
  testDisabled = false,
}: IntegrationConnectionSettingsViewProps) {
  return (
    <>
      <SettingsContentHeader
        title={title}
        description={headerDescription}
        connected={connected}
      />
      <section className="settings-card">
        <h2>Connection</h2>
        <div className="settings-card-body-copy">{body}</div>

        <dl className="settings-sync-status">
          <div>
            <dt>Status</dt>
            <dd>{statusLabel}</dd>
          </div>
          <div>
            <dt>{secondaryLabel}</dt>
            <dd>{secondaryValue}</dd>
          </div>
        </dl>

        {reason ? <p className="settings-hint">{reason}</p> : null}
        {hint ? <p className="settings-hint">{hint}</p> : null}

        <div className="settings-integration-actions">
          <button
            type="button"
            disabled={testDisabled || testing || !onTestConnection}
            onClick={onTestConnection}
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>

        {testMessage ? (
          <p
            className={[
              "settings-integration-test-result",
              testOk === true
                ? "settings-integration-test-result--ok"
                : testOk === false
                  ? "settings-integration-test-result--error"
                  : null,
            ]
              .filter(Boolean)
              .join(" ")}
            role="status"
          >
            {testMessage}
          </p>
        ) : null}
      </section>
    </>
  );
}

export type GithubSettingsOrganization = {
  login: string;
};

export type GithubSettingsSectionViewProps = {
  title: string;
  headerDescription: string;
  loading?: boolean;
  connected?: boolean;
  login: string | null;
  scopes: string[];
  missingScopes: string[];
  organizations: GithubSettingsOrganization[];
  repositoryCount: number | null;
  reason?: string | null;
  connecting?: boolean;
  testing?: boolean;
  testMessage?: string | null;
  testOk?: boolean | null;
  connectLabel: string;
  onConnect: () => void;
  onTestConnection: () => void;
  connectDisabled?: boolean;
};

export function GithubSettingsSectionView({
  title,
  headerDescription,
  loading = false,
  connected,
  login,
  scopes,
  missingScopes,
  organizations,
  repositoryCount,
  reason,
  connecting = false,
  testing = false,
  testMessage,
  testOk,
  connectLabel,
  onConnect,
  onTestConnection,
  connectDisabled = false,
}: GithubSettingsSectionViewProps) {
  const statusLabel = loading
    ? "Loading…"
    : connected
      ? missingScopes.length > 0
        ? "Connected — needs more access"
        : "Connected"
      : "Not connected";

  return (
    <>
      <SettingsContentHeader
        title={title}
        description={headerDescription}
        connected={loading ? undefined : connected && missingScopes.length === 0}
      />
      <section className="settings-card">
        <h2>Connection</h2>
        <div className="settings-card-body-copy">
          <p>
            Use a GitHub personal access token (Settings or{" "}
            <code>GITHUB_API_TOKEN</code>) so commits and pull requests load
            without Clerk. Optional Connect GitHub OAuth remains available when
            you want per-user access. Token needs <code>repo</code> (and usually{" "}
            <code>read:org</code>).
          </p>
        </div>

        <dl className="settings-sync-status">
          <div>
            <dt>Status</dt>
            <dd>{statusLabel}</dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>{login ?? "—"}</dd>
          </div>
          <div>
            <dt>Scopes</dt>
            <dd>{scopes.length > 0 ? scopes.join(", ") : "—"}</dd>
          </div>
          <div>
            <dt>Organizations</dt>
            <dd>
              {organizations.length > 0
                ? organizations.map((org) => org.login).join(", ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Repositories (sample)</dt>
            <dd>
              {repositoryCount === null ? "—" : String(repositoryCount)}
            </dd>
          </div>
        </dl>

        {reason ? <p className="settings-hint">{reason}</p> : null}

        <div className="settings-integration-actions">
          <button
            type="button"
            disabled={connectDisabled || connecting || loading}
            onClick={onConnect}
          >
            {connecting ? "Opening GitHub…" : connectLabel}
          </button>
          <button
            type="button"
            disabled={testing || loading}
            onClick={onTestConnection}
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>

        {testMessage ? (
          <p
            className={[
              "settings-integration-test-result",
              testOk === true
                ? "settings-integration-test-result--ok"
                : testOk === false
                  ? "settings-integration-test-result--error"
                  : null,
            ]
              .filter(Boolean)
              .join(" ")}
            role="status"
          >
            {testMessage}
          </p>
        ) : null}
      </section>
    </>
  );
}
