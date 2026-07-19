"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  APP_TIMEZONE_OPTIONS,
  normalizeAppTimezone,
} from "../app-timezone.js";
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

export type SyncSettingsSectionViewProps = {
  statusLabel: string;
  lastSyncLabel: string;
  errorMessage?: string | null;
  syncing?: boolean;
  onSyncNow?: () => void;
  backendModeToggle?: ReactNode;
  urlLabel?: string | null;
  warningText?: string | null;
  confirmAction?: {
    label: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null;
};

export function SyncSettingsSectionView({
  statusLabel,
  lastSyncLabel,
  errorMessage,
  syncing = false,
  onSyncNow,
  backendModeToggle,
  urlLabel,
  warningText,
  confirmAction,
}: SyncSettingsSectionViewProps) {
  return (
    <section className="settings-card">
      <div className="settings-sync-header">
        <div className="settings-sync-header-copy">
          <h2>Sync status</h2>
          <p>Cloud sync connection and last successful sync time.</p>
        </div>
        {backendModeToggle}
      </div>

      <dl className="settings-sync-status">
        <div>
          <dt>Status</dt>
          <dd>{statusLabel}</dd>
        </div>
        <div>
          <dt>Last sync</dt>
          <dd>{lastSyncLabel}</dd>
        </div>
        {urlLabel ? (
          <div>
            <dt>URL</dt>
            <dd>
              <code className="settings-backend-mode-origin" title={urlLabel}>
                {urlLabel}
              </code>
            </dd>
          </div>
        ) : null}
      </dl>

      {warningText ? (
        <p className="settings-warning-text" role="status">
          {warningText}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="settings-error-text">{errorMessage}</p>
      ) : null}

      {confirmAction ? (
        <button
          type="button"
          className={confirmAction.danger ? "settings-danger-button" : undefined}
          onClick={confirmAction.onConfirm}
        >
          {confirmAction.label}
        </button>
      ) : (
        <button
          type="button"
          disabled={!onSyncNow}
          onClick={() => {
            if (!onSyncNow) return;
            onSyncNow();
          }}
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      )}
    </section>
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
