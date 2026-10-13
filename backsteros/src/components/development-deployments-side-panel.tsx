import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import {
  ContentSidePanelEmpty,
  ContentSidePanelHeader,
  CrmActivityFeedView,
  type CrmActivityFeedItem,
} from "@backsteros/ui";

import {
  deploymentViaLabel,
  fetchT3CodeDeployments,
  type DiscoveredDeployment,
} from "../lib/t3code-hetzner";

const DISPLAY_LIMIT = 20;

function deploymentToActivityItem(
  entry: DiscoveredDeployment,
): CrmActivityFeedItem {
  const via = deploymentViaLabel(entry);
  const metaParts = [`via ${via}`];
  if (entry.serverName) metaParts.push(entry.serverName);
  if (entry.branch) metaParts.push(entry.branch);

  return {
    id: entry.id,
    kind: "deployment",
    occurredAt: entry.at,
    deploymentStatus: entry.status,
    deploymentSite: entry.siteDomain || entry.appName,
    deploymentCommit: entry.commit,
    deploymentSummary: entry.summary,
    deploymentMeta: metaParts.join(" · "),
  };
}

/**
 * Read-only recent deployments as an activity timeline (same chrome as CRM).
 */
export function DevelopmentDeploymentsSidePanel() {
  const [deployments, setDeployments] = useState<
    readonly DiscoveredDeployment[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchT3CodeDeployments({ force });
      if (!data.ok && data.error) {
        setDeployments([]);
        setError(data.error);
        return;
      }
      setDeployments(data.deployments ?? []);
      if (!(data.deployments?.length) && data.error) {
        setError(data.error);
      }
    } catch (err) {
      setDeployments([]);
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach T3 Code. Is the development server running?",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = useMemo(
    () => deployments.slice(0, DISPLAY_LIMIT).map(deploymentToActivityItem),
    [deployments],
  );

  return (
    <div className="app-content-side-panel flex h-full min-h-0 flex-col">
      <ContentSidePanelHeader
        title="Deployments"
        actions={
          <button
            type="button"
            className="app-side-panel-section-action"
            onClick={() => void refresh(true)}
            title="Refresh deployments"
            aria-label="Refresh deployments"
            disabled={loading}
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        }
      />
      <div className="app-content-side-panel-main min-h-0 flex-1 overflow-y-auto p-2">
        {!loading && error && items.length === 0 ? (
          <ContentSidePanelEmpty>{error}</ContentSidePanelEmpty>
        ) : (
          <CrmActivityFeedView
            items={items}
            loading={loading}
            error={items.length > 0 ? error : null}
          />
        )}
      </div>
    </div>
  );
}
