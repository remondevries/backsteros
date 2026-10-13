import { createFileRoute } from "@tanstack/react-router";

import { ServerDetailPage } from "../components/servers/ServerDetailPage";
import { isObserveSectionId, type ObserveSectionId } from "../components/servers/ServerObserveTab";
import {
  isProcessesSectionId,
  type ProcessesSectionId,
} from "../components/servers/ServerProcessesTab";
import { isRuntimeSectionId, type RuntimeSectionId } from "../components/servers/ServerRuntimeTab";
import { isStorageSectionId, type StorageSectionId } from "../components/servers/ServerStorageTab";
import {
  isServerDetailTabId,
  type ServerDetailTabId,
} from "../components/servers/staticServerProfiles";

export type ServerDetailSectionId =
  | StorageSectionId
  | RuntimeSectionId
  | ObserveSectionId
  | ProcessesSectionId;

export type ServerDetailSearch = {
  readonly tab?: ServerDetailTabId;
  readonly section?: ServerDetailSectionId;
};

function isServerDetailSectionId(value: unknown): value is ServerDetailSectionId {
  return (
    isStorageSectionId(value) ||
    isRuntimeSectionId(value) ||
    isObserveSectionId(value) ||
    isProcessesSectionId(value)
  );
}

export const Route = createFileRoute("/servers/$serverId")({
  validateSearch: (raw: Record<string, unknown>): ServerDetailSearch => ({
    ...(isServerDetailTabId(raw.tab) ? { tab: raw.tab } : {}),
    ...(isServerDetailSectionId(raw.section) ? { section: raw.section } : {}),
  }),
  component: ServerDetailRoute,
});

function ServerDetailRoute() {
  const { serverId } = Route.useParams();
  const { tab, section } = Route.useSearch();
  const resolvedTab = tab ?? "overview";
  const storageSection: StorageSectionId =
    section && isStorageSectionId(section) ? section : "database";
  const runtimeSection: RuntimeSectionId =
    section && isRuntimeSectionId(section) ? section : "docker";
  const observeSection: ObserveSectionId =
    section && isObserveSectionId(section) ? section : "monitoring";
  const processesSection: ProcessesSectionId =
    section && isProcessesSectionId(section) ? section : "background";

  return (
    <ServerDetailPage
      serverId={serverId}
      tab={resolvedTab}
      storageSection={storageSection}
      runtimeSection={runtimeSection}
      observeSection={observeSection}
      processesSection={processesSection}
    />
  );
}
