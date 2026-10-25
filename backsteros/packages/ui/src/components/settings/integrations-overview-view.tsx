"use client";

import type { WorkspaceIntegrationId } from "../../integrations/integration-catalog.js";
import { SwitchToggle } from "../shared/switch-toggle.js";
import { IntegrationMark } from "./integration-mark.js";
import {
  SettingsConnectionStatusSwap,
  type SettingsConnectionStatus,
} from "./settings-connection-status-swap.js";

export type IntegrationsOverviewItem = {
  id: WorkspaceIntegrationId;
  title: string;
  description: string;
  faviconHost: string;
  /** True when credentials / config are saved in settings. */
  configured: boolean;
  /**
   * True after a live provider probe succeeded (same check as Test connection).
   */
  connected: boolean;
  enabled: boolean;
  statusLoading?: boolean;
  /** Settings loaded; live probe still in flight. */
  statusChecking?: boolean;
};

export type IntegrationsOverviewViewProps = {
  items: IntegrationsOverviewItem[];
  onToggleEnabled: (id: WorkspaceIntegrationId, enabled: boolean) => void;
  onOpenSettings: (id: WorkspaceIntegrationId) => void;
  togglingId?: WorkspaceIntegrationId | null;
};

/**
 * Settings → Integrations grid (shadcnui-blocks integrations-03 layout,
 * three cards per row).
 */
export function IntegrationsOverviewView({
  items,
  onToggleEnabled,
  onOpenSettings,
  togglingId = null,
}: IntegrationsOverviewViewProps) {
  return (
    <div className="integrations-overview">
      <ul className="integrations-overview__list">
        {items.map((item) => {
          const busy = togglingId === item.id;
          const status: SettingsConnectionStatus =
            item.statusLoading || item.statusChecking
              ? "working"
              : item.connected
                ? "success"
                : "failed";
          return (
            <li key={item.id} className="integrations-overview__item">
              <div
                className={[
                  "integrations-overview__card",
                  item.enabled ? null : "is-disabled",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <SettingsConnectionStatusSwap
                  className="integrations-overview__status"
                  status={status}
                />
                <div className="integrations-overview__card-top">
                  <IntegrationMark id={item.id} faviconHost={item.faviconHost} />
                  <div className="integrations-overview__body">
                    <div className="integrations-overview__title-row">
                      <span className="integrations-overview__title">
                        {item.title}
                      </span>
                    </div>
                    <p className="integrations-overview__description">
                      {item.description}
                    </p>
                  </div>
                </div>
                <div className="integrations-overview__actions">
                  <button
                    type="button"
                    className="integrations-overview__action-btn"
                    onClick={() => onOpenSettings(item.id)}
                  >
                    Settings
                  </button>
                  <SwitchToggle
                    checked={item.enabled}
                    disabled={busy}
                    ariaLabel={`${item.enabled ? "Disable" : "Enable"} ${item.title}`}
                    onCheckedChange={(checked) =>
                      onToggleEnabled(item.id, checked)
                    }
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
