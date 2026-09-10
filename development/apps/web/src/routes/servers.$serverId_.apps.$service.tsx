import { createFileRoute } from "@tanstack/react-router";

import {
  AppDetailPage,
  isAppDetailTabId,
  type AppDetailTabId,
} from "../components/servers/AppDetailPage";
import { isNetworkSectionId, type NetworkSectionId } from "../components/servers/AppNetworkTab";
import { isSettingsSectionId, type SettingsSectionId } from "../components/servers/AppSettingsTab";
import { isObserveSectionId, type ObserveSectionId } from "../components/servers/ServerObserveTab";
import {
  isProcessesSectionId,
  type ProcessesSectionId,
} from "../components/servers/ServerProcessesTab";

export type AppDetailSearch = {
  readonly tab?: AppDetailTabId;
  readonly section?: ObserveSectionId | ProcessesSectionId | NetworkSectionId | SettingsSectionId;
  readonly commandId?: string;
  readonly deploymentId?: string;
};

export const Route = createFileRoute("/servers/$serverId_/apps/$service")({
  validateSearch: (raw: Record<string, unknown>): AppDetailSearch => ({
    ...(isAppDetailTabId(raw.tab) ? { tab: raw.tab } : {}),
    ...(isObserveSectionId(raw.section) ||
    isProcessesSectionId(raw.section) ||
    isNetworkSectionId(raw.section) ||
    isSettingsSectionId(raw.section)
      ? {
          section: raw.section as
            | ObserveSectionId
            | ProcessesSectionId
            | NetworkSectionId
            | SettingsSectionId,
        }
      : {}),
    ...(typeof raw.commandId === "string" && raw.commandId.trim()
      ? { commandId: raw.commandId.trim() }
      : {}),
    ...(typeof raw.deploymentId === "string" && raw.deploymentId.trim()
      ? { deploymentId: raw.deploymentId.trim() }
      : {}),
  }),
  component: AppDetailRoute,
});

function AppDetailRoute() {
  const { serverId, service } = Route.useParams();
  const { tab, section, commandId, deploymentId } = Route.useSearch();
  const resolvedTab = tab ?? "overview";
  const observeSection: ObserveSectionId =
    section && isObserveSectionId(section) ? section : "monitoring";
  const processesSection: ProcessesSectionId =
    section && isProcessesSectionId(section) ? section : "background";
  const networkSection: NetworkSectionId =
    section && isNetworkSectionId(section) ? section : "security";
  const settingsSection: SettingsSectionId =
    section && isSettingsSectionId(section) ? section : "general";
  return (
    <AppDetailPage
      serverId={serverId}
      service={service}
      tab={resolvedTab}
      observeSection={observeSection}
      processesSection={processesSection}
      networkSection={networkSection}
      settingsSection={settingsSection}
      commandId={commandId ?? null}
      deploymentId={deploymentId ?? null}
    />
  );
}
