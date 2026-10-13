"use client";

import type { PortalContactLog } from "@backsteros/contracts";

export type ContactPortalLogsTabViewProps = {
  logs: readonly PortalContactLog[];
  loading?: boolean;
  error?: string | null;
};

function formatOccurredAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function logTitle(log: PortalContactLog): string {
  if (log.kind === "login") {
    return "Logged in";
  }
  const name = log.projectName?.trim();
  const key = log.projectKey?.trim();
  if (name && key) {
    return `Viewed ${name} (${key})`;
  }
  if (name) {
    return `Viewed ${name}`;
  }
  return "Viewed project";
}

export function ContactPortalLogsTabView({
  logs,
  loading = false,
  error = null,
}: ContactPortalLogsTabViewProps) {
  if (loading) {
    return (
      <p className="contact-portal-logs-tab__hint" role="status">
        Loading portal logs…
      </p>
    );
  }

  if (error) {
    return (
      <p className="contact-portal-logs-tab__error" role="alert">
        {error}
      </p>
    );
  }

  if (logs.length === 0) {
    return (
      <p className="contact-portal-logs-tab__hint">
        No portal activity yet. Logs appear after the contact signs in or opens
        a project.
      </p>
    );
  }

  return (
    <ul className="contact-portal-logs-tab__list">
      {logs.map((log) => (
        <li key={log.id} className="contact-portal-logs-tab__row">
          <div className="contact-portal-logs-tab__copy">
            <span className="contact-portal-logs-tab__title">{logTitle(log)}</span>
            <time
              className="contact-portal-logs-tab__when"
              dateTime={log.occurredAt}
              title={formatOccurredAt(log.occurredAt)}
            >
              {formatOccurredAt(log.occurredAt)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}
