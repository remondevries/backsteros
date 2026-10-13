"use client";

import type { WorkspaceIntegrationId } from "../../integrations/integration-catalog.js";
import { SwitchToggle } from "../shared/switch-toggle.js";

export type IntegrationsOverviewItem = {
  id: WorkspaceIntegrationId;
  title: string;
  description: string;
  faviconHost: string;
  /** True when credentials / config are saved in settings. */
  configured: boolean;
  /** True when the integration can currently talk to the provider. */
  connected: boolean;
  enabled: boolean;
  statusLoading?: boolean;
};

export type IntegrationsOverviewViewProps = {
  items: IntegrationsOverviewItem[];
  onToggleEnabled: (id: WorkspaceIntegrationId, enabled: boolean) => void;
  onOpenSettings: (id: WorkspaceIntegrationId) => void;
  togglingId?: WorkspaceIntegrationId | null;
};

function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

export function IntegrationsOverviewView({
  items,
  onToggleEnabled,
  onOpenSettings,
  togglingId = null,
}: IntegrationsOverviewViewProps) {
  return (
    <div className="integrations-overview">
      <p className="integrations-overview__intro">
        Connect your favorite tools and services to your workspace.
      </p>
      <ul className="integrations-overview__list">
        {items.map((item) => {
          const busy = togglingId === item.id;
          const actionLabel = item.configured ? "Settings" : "Connect";
          return (
            <li key={item.id}>
              <div
                className={[
                  "integrations-overview__card",
                  item.enabled ? null : "is-disabled",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="integrations-overview__icon-rail">
                  <img
                    alt=""
                    className="integrations-overview__favicon"
                    src={faviconUrl(item.faviconHost)}
                    width={32}
                    height={32}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="integrations-overview__body">
                  <div className="integrations-overview__title-row">
                    <span className="integrations-overview__title">
                      {item.title}
                    </span>
                    {item.statusLoading ? (
                      <span className="integrations-overview__badge integrations-overview__badge--muted">
                        Loading…
                      </span>
                    ) : item.connected ? (
                      <span className="integrations-overview__badge integrations-overview__badge--connected">
                        Connected
                      </span>
                    ) : null}
                  </div>
                  <p className="integrations-overview__description">
                    {item.description}
                  </p>
                </div>
                <div className="integrations-overview__actions">
                  <SwitchToggle
                    checked={item.enabled}
                    disabled={busy}
                    ariaLabel={`${item.enabled ? "Disable" : "Enable"} ${item.title}`}
                    onCheckedChange={(checked) =>
                      onToggleEnabled(item.id, checked)
                    }
                  />
                  <button
                    type="button"
                    className="integrations-overview__action-btn"
                    onClick={() => onOpenSettings(item.id)}
                  >
                    {actionLabel}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
