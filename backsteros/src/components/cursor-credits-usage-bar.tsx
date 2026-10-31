import { useEffect, useState, type ReactNode } from "react";
import { ClaudeMarkIcon, CursorMarkIcon, XaiMarkIcon } from "@backsteros/ui";

import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopApi } from "../lib/api-context";
import {
  cursorUsageTitle,
  formatDaysUntilReset,
  formatPlanPercent,
  formatUsdCents,
  planUsageTone,
  type CursorUsage,
} from "../lib/cursor-usage";
import { invoke } from "../lib/tauri-invoke-instrumentation";
import { isTauriRuntime } from "../lib/tauri-runtime";
import { SyncConflictPrototypeAlert } from "./sync-conflict-prototype-alert";

const POLL_MS = 5 * 60 * 1000;

function AgentMailDegradedAlert() {
  return (
    <div
      className="sidebar-agentmail-degraded"
      role="alert"
      title="Mail provider hit a temporary error and is retrying. Email lists may be empty until it recovers — reload only if this stays."
    >
      AgentMail reconnecting…
    </div>
  );
}

function UsageBar({
  label,
  percent,
  icon,
  resetLabel,
  valueSuffix,
  muted = false,
}: {
  label: string;
  percent: number;
  icon?: ReactNode;
  /** e.g. "3d" until quota / billing cycle resets. */
  resetLabel?: string | null;
  /** Shown after the label, e.g. "($340)" next to Premium. */
  valueSuffix?: string | null;
  /** Dim label/icon when unused (e.g. Agents at 0%). */
  muted?: boolean;
}) {
  const tone = planUsageTone(percent);
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={[
        "sidebar-cursor-credits-bar-row",
        muted ? "sidebar-cursor-credits-bar-row--muted" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="sidebar-cursor-credits-bar-head">
        <span className="sidebar-cursor-credits-bar-label">
          {icon}
          {label}
          {resetLabel ? (
            <span className="sidebar-cursor-credits-reset">({resetLabel})</span>
          ) : null}
          {valueSuffix ? (
            <span className="sidebar-cursor-credits-bar-value-suffix">
              {valueSuffix}
            </span>
          ) : null}
        </span>
        <span className="sidebar-cursor-credits-bar-pct">
          {formatPlanPercent(clamped)}
        </span>
      </div>
      <div
        className="sidebar-cursor-credits-track"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
      >
        <div
          className={`sidebar-cursor-credits-fill sidebar-cursor-credits-fill--${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function CursorCreditsBody({
  usage,
  loading,
}: {
  usage: CursorUsage | null;
  loading: boolean;
}) {
  if (!usage?.available) {
    return (
      <div className="sidebar-cursor-credits" aria-busy={loading}>
        <div className="sidebar-cursor-credits-meta">
          {loading
            ? "Loading plan…"
            : usage?.error?.trim() || "Sign in to Cursor on this machine"}
        </div>
      </div>
    );
  }

  const premiumRemainingSuffix =
    usage.remainingCents != null &&
    usage.remainingCents > 0 &&
    usage.limitCents != null &&
    usage.limitCents > 0
      ? `(${formatUsdCents(usage.remainingCents)})`
      : null;
  const resetDaysLabel = formatDaysUntilReset(usage.billingCycleEndMs);
  const agentsResetDaysLabel = formatDaysUntilReset(usage.grokBotResetMs);

  return (
    <div
      className="sidebar-cursor-credits"
      title={cursorUsageTitle(usage)}
      aria-label={cursorUsageTitle(usage)}
    >
      <UsageBar
        label="Auto"
        percent={usage.autoPercentUsed}
        resetLabel={resetDaysLabel}
        icon={
          <CursorMarkIcon
            size={11}
            className="sidebar-cursor-credits-bar-icon"
          />
        }
      />
      <UsageBar
        label="Premium"
        percent={usage.apiPercentUsed}
        valueSuffix={premiumRemainingSuffix}
        icon={
          <ClaudeMarkIcon
            size={11}
            className="sidebar-cursor-credits-bar-icon"
          />
        }
      />
      {usage.grokBotPercentUsed != null ? (
        <UsageBar
          label="Agents"
          percent={usage.grokBotPercentUsed}
          resetLabel={agentsResetDaysLabel}
          muted={usage.grokBotPercentUsed <= 0}
          icon={
            <XaiMarkIcon
              size={11}
              className="sidebar-cursor-credits-bar-icon"
            />
          }
        />
      ) : null}
    </div>
  );
}

function unavailableUsage(error: string): CursorUsage {
  return {
    available: false,
    autoPercentUsed: 0,
    apiPercentUsed: 0,
    totalPercentUsed: 0,
    error,
    sampledAt: Date.now(),
  };
}

/**
 * Prefer core Settings Cursor key (server never returns the secret), then local
 * Tauri token sources (env / IDE / CLI keychain).
 */
async function loadCursorUsage(
  requestJson: <T>(path: string) => Promise<T>,
): Promise<CursorUsage> {
  let settingsError: string | null = null;
  let fromSettings: CursorUsage | null = null;

  try {
    fromSettings = await requestJson<CursorUsage>(
      "/api/v1/settings/cursor/usage",
    );
    if (!fromSettings.available) {
      settingsError =
        fromSettings.error?.trim() ||
        "Settings Cursor API key did not return usage.";
      fromSettings = null;
    }
  } catch {
    settingsError = "Settings Cursor usage request failed.";
  }

  if (isTauriRuntime()) {
    try {
      const fromLocal = await invoke<CursorUsage>("cursor_usage");
      if (fromSettings?.available) {
        // Older cores dropped ISO nextResetTimestampUtc → null grokBotResetMs.
        // Fill Agents reset (and missing Grok %) from the local Tauri path.
        if (
          fromSettings.grokBotResetMs == null &&
          fromLocal.available &&
          fromLocal.grokBotResetMs != null
        ) {
          return {
            ...fromSettings,
            grokBotPercentUsed:
              fromSettings.grokBotPercentUsed ?? fromLocal.grokBotPercentUsed,
            grokBotResetMs: fromLocal.grokBotResetMs,
          };
        }
        return fromSettings;
      }
      if (fromLocal.available) {
        return fromLocal;
      }
      const localError =
        fromLocal.error?.trim() || "Local Cursor session unavailable.";
      const settingsPart =
        settingsError ?? "Settings Cursor usage unavailable.";
      return unavailableUsage(`${settingsPart} Local fallback: ${localError}`);
    } catch {
      if (fromSettings?.available) return fromSettings;
      const settingsPart =
        settingsError ?? "Settings Cursor usage unavailable.";
      return unavailableUsage(
        `${settingsPart} Local fallback: Cursor credits invoke failed.`,
      );
    }
  }

  if (fromSettings?.available) return fromSettings;
  return unavailableUsage(
    settingsError ?? "Settings Cursor usage unavailable.",
  );
}

type CursorCreditsUsageBarProps = {
  /** Opens Settings → Syncing in a new product tab (sync-conflict prototype). */
  onOpenSyncingSettings?: () => void;
};

/**
 * Sidebar footer: Cursor monthly included Auto / Premium usage toward the plan
 * allowance, plus weekly Agents (Grok) quota when the account includes it.
 * Shows a static sync-conflict prototype and a temporary AgentMail alert above
 * the credits while the mail provider is crashed and auto-retrying.
 */
export function CursorCreditsUsageBar({
  onOpenSyncingSettings,
}: CursorCreditsUsageBarProps = {}) {
  const { degraded: agentMailDegraded } = useAgentMail();
  const { client } = useDesktopApi();
  const [usage, setUsage] = useState<CursorUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await loadCursorUsage((path) =>
          client.requestJson(path),
        );
        if (!cancelled) {
          setUsage(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setUsage(unavailableUsage("Cursor credits unavailable"));
          setLoading(false);
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client]);

  return (
    <div className="sidebar-footer-status-stack">
      <SyncConflictPrototypeAlert
        onOpenSyncingSettings={onOpenSyncingSettings}
      />
      {agentMailDegraded ? <AgentMailDegradedAlert /> : null}
      <CursorCreditsBody usage={usage} loading={loading} />
    </div>
  );
}
