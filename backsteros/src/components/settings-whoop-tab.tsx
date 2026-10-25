import { useCallback, useEffect, useState } from "react";
import { SettingsTestConnectionSwap } from "@backsteros/ui";

import {
  fetchWhoopDaySnapshot,
  fetchWhoopSettingsStatus,
  todayIsoDate,
  type WhoopSettingsStatus,
} from "../lib/whoop";

function maskWhoopEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}•••${domain}`;
}

function whoopStatusFieldValue(status: WhoopSettingsStatus | null): string {
  if (status === null) return "Loading…";
  if (status.connected) {
    return status.email
      ? `Connected as ${maskWhoopEmail(status.email)}.`
      : "Connected.";
  }
  const reason = status.reason?.trim();
  if (reason) return reason.endsWith(".") ? reason : `${reason}.`;
  return "Not connected.";
}

export function SettingsWhoopTab({
  title: _title,
  description: _description,
  hideHeader: _hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const [status, setStatus] = useState<WhoopSettingsStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchWhoopSettingsStatus();
      setStatus(next);
      return next;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not read Whoop status.";
      const fallback: WhoopSettingsStatus = {
        connected: false,
        configured: false,
        email: null,
        reason: message,
        envPath: "",
      };
      setStatus(fallback);
      return fallback;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="settings-card settings-card--bare">
      <h2>Connection</h2>
      <p>
        Recovery, sleep, and strain appear above journal entries when Whoop
        credentials are configured. Tokens are read from a local{" "}
        <code>totem.env</code> file under <code>~/.backsteros-agent/</code>.
        BacksterOS does not store Whoop passwords.
      </p>
      <label className="settings-field">
        Status
        <div className="settings-secret-field-row">
          <div className="settings-secret-field-row__control">
            <input
              type="text"
              readOnly
              disabled
              value={whoopStatusFieldValue(status)}
              aria-label="Whoop connection status"
            />
            <SettingsTestConnectionSwap
              disabled={status === null}
              onTest={async () => {
                const result = await fetchWhoopDaySnapshot(todayIsoDate());
                await refresh();
                if (!result.authenticated) {
                  throw new Error(
                    result.error ??
                      "Whoop is not connected. Add refresh or bearer tokens to totem.env.",
                  );
                }
                if (!result.snapshot) {
                  throw new Error(
                    result.error ??
                      "Could not load today\u2019s Whoop snapshot.",
                  );
                }
              }}
            />
          </div>
        </div>
      </label>
      {status && !status.connected && status.envPath ? (
        <p className="settings-hint">
          Looking for tokens at <code>{status.envPath}</code>.
        </p>
      ) : null}
    </section>
  );
}
