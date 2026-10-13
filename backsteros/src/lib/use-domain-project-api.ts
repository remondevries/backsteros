import { useCallback, useMemo } from "react";

import type {
  DomainCloudflareDnsResult,
  DomainRegistrarContact,
  DomainRegistrarDetail,
} from "@backsteros/ui";
import { collectTransipDomainTagsFromProjects } from "@backsteros/ui";

import { useDesktopApi } from "./api-context";
import { useDesktopWorkspaceData } from "./workspace-data";

/**
 * TransIP / Cloudflare helpers shared by Catalog Domains and the domain
 * project workbench side panel.
 */
export function useDomainProjectApi() {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();

  const knownDomainTags = useMemo(
    () =>
      collectTransipDomainTagsFromProjects(
        workspace.projects.filter((project) => project.type === "domeinname"),
      ),
    [workspace.projects],
  );

  const loadDomainRegistrarDetail = useCallback(
    async (domainName: string): Promise<DomainRegistrarDetail> => {
      return client.requestJson<DomainRegistrarDetail>(
        `/api/v1/transip/domains/${encodeURIComponent(domainName)}`,
      );
    },
    [client],
  );

  const updateDomainTags = useCallback(
    async (domainName: string, tags: string[]) => {
      return client.requestJson<{ tags: string[]; projectId: string | null }>(
        `/api/v1/transip/domains/${encodeURIComponent(domainName)}/tags`,
        {
          method: "PUT",
          body: JSON.stringify({ tags }),
        },
      );
    },
    [client],
  );

  const updateDomainContacts = useCallback(
    async (domainName: string, contacts: DomainRegistrarContact[]) => {
      return client.requestJson<{ contacts: DomainRegistrarContact[] }>(
        `/api/v1/transip/domains/${encodeURIComponent(domainName)}/contacts`,
        {
          method: "PUT",
          body: JSON.stringify({ contacts }),
        },
      );
    },
    [client],
  );

  const loadCloudflareDnsRecords = useCallback(
    async (zoneId: string): Promise<DomainCloudflareDnsResult> => {
      return client.requestJson<DomainCloudflareDnsResult>(
        `/api/v1/cloudflare/zones/${encodeURIComponent(zoneId)}/dns-records`,
      );
    },
    [client],
  );

  const purgeCloudflareCache = useCallback(
    async (zoneId: string): Promise<void> => {
      await client.requestJson(
        `/api/v1/cloudflare/zones/${encodeURIComponent(zoneId)}/purge-cache`,
        { method: "POST" },
      );
    },
    [client],
  );

  return {
    knownDomainTags,
    loadDomainRegistrarDetail,
    updateDomainTags,
    updateDomainContacts,
    loadCloudflareDnsRecords,
    purgeCloudflareCache,
  };
}
