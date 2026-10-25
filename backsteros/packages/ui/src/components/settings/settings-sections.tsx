"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  APP_TIMEZONE_OPTIONS,
  normalizeAppTimezone,
} from "../../shared/app-timezone.js";
import { SettingsContentHeader } from "./settings-content-header.js";
import { SettingsTestConnectionSwap } from "./settings-test-connection-swap.js";

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

/** @deprecated Account now uses ContactDetailView for the default-assignee profile. */
export type AccountSettingsSectionViewProps = {
  email?: string | null;
  showEmail?: boolean;
  assigneeField?: ReactNode;
};

/** @deprecated Prefer Settings Account contact profile. Kept for export stability. */
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
      {assigneeField ? (
        <section className="settings-card">
          <h2>Default assignee</h2>
          <p>
            This contact is the default assignee for newly created tasks. You
            can still change the assignee on individual tasks.
          </p>
          {assigneeField}
        </section>
      ) : null}
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
  /** Hide the page header when embedded in a modal. */
  hideHeader?: boolean;
  statusLabel: string;
  secondaryLabel: string;
  secondaryValue: string;
  hint?: string | null;
  reason?: string | null;
  /** @deprecated Unused — Action swap owns the working phase. Kept for call-site compat. */
  testing?: boolean;
  /** Resolve on success; reject/throw on failure so the Action swap can animate. */
  onTestConnection?: () => void | PromiseLike<unknown>;
  testDisabled?: boolean;
  /** When true, omit the Connection-card Test button (e.g. actions live on the secret field row). */
  hideTestButton?: boolean;
};

export function IntegrationConnectionSettingsView({
  title,
  headerDescription,
  body,
  connected,
  hideHeader = false,
  statusLabel,
  secondaryLabel,
  secondaryValue,
  hint,
  reason,
  onTestConnection,
  testDisabled = false,
  hideTestButton = false,
}: IntegrationConnectionSettingsViewProps) {
  return (
    <>
      {hideHeader ? null : (
        <SettingsContentHeader
          title={title}
          description={headerDescription}
          connected={connected}
        />
      )}
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

        {hideTestButton || !onTestConnection ? null : (
          <div className="settings-integration-actions">
            <SettingsTestConnectionSwap
              disabled={testDisabled}
              onTest={onTestConnection}
            />
          </div>
        )}
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
  connectLabel: string;
  onConnect: () => void;
  onTestConnection: () => void | PromiseLike<unknown>;
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
            <code>GITHUB_API_TOKEN</code>) so commits and pull requests load.
            Token needs <code>repo</code> (and usually <code>read:org</code>).
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
          <SettingsTestConnectionSwap
            disabled={loading}
            onTest={onTestConnection}
          />
        </div>
      </section>
    </>
  );
}
