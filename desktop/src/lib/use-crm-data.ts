import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiClientError } from "@backsteros/api-client";
import type {
  ContactRelationshipListItem,
  CrmActivity,
  CrmGroup,
  CrmGroupSubjectType,
  CrmRelationshipLabel,
} from "@backsteros/contracts";

import { useDesktopApi } from "./api-context";
import { useDesktopPowerSync, usePowerSyncQuery } from "./powersync-context";
import {
  mapContactRelationshipListItem,
  mapCrmActivityRow,
  mapCrmRelationshipLabelRow,
  type ContactRelationshipRow,
  type CrmActivityRow,
  type CrmRelationshipLabelRow,
} from "./workspace/crm-row-mappers";
import {
  addCrmGroupMemberWithRetry,
  createContactRelationshipViaPowerSyncOrApi,
  createCrmActivityNoteViaPowerSyncOrApi,
  createCrmGroupViaPowerSyncOrApi,
  createCrmRelationshipLabelViaPowerSyncOrApi,
  deleteContactRelationshipViaPowerSyncOrApi,
  deleteCrmGroupViaPowerSyncOrApi,
  deleteCrmRelationshipLabelViaPowerSyncOrApi,
  removeCrmGroupMemberViaPowerSyncOrApi,
  updateCrmGroupViaPowerSyncOrApi,
  updateCrmRelationshipLabelViaPowerSyncOrApi,
} from "./workspace/crm-mutations";
import {
  dedupeCatalogGroups,
  reconcileDuplicateCrmGroups,
} from "./workspace/crm-group-reconcile";
import {
  CONTACT_RELATIONSHIPS_FOR_CONTACT_SQL,
  CRM_ACTIVITIES_FOR_SUBJECT_SQL,
  CRM_RELATIONSHIP_LABELS_SQL,
} from "./workspace/workspace-sql";

export { addCrmGroupMemberWithRetry } from "./workspace/crm-mutations";

const CRM_ACTIVITY_PAGE_SIZE = 30;

type FeedState = {
  items: CrmActivity[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

function useCrmLocalReads(enabled: boolean) {
  const { ready } = useDesktopPowerSync();
  return Boolean(enabled && ready);
}

/** Local-first creates can open a card before Postgres has the row — treat as empty. */
function isSubjectMissingError(error: unknown): boolean {
  if (error instanceof ApiClientError && error.status === 404) {
    const message = error.message.toLowerCase();
    return (
      message.includes("contact not found") ||
      message.includes("organization not found") ||
      message.includes("member subject not found")
    );
  }
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("contact not found") ||
    message.includes("organization not found") ||
    message.includes("member subject not found")
  );
}

export function useCrmActivityFeed(
  subjectType: CrmGroupSubjectType,
  subjectId: string | null,
  enabled: boolean,
) {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const localEnabled = useCrmLocalReads(enabled && Boolean(subjectId));
  const activityQuery = usePowerSyncQuery<CrmActivityRow>(
    localEnabled ? CRM_ACTIVITIES_FOR_SUBJECT_SQL : null,
    localEnabled && subjectId ? [subjectType, subjectId] : [],
  );
  const [visibleCount, setVisibleCount] = useState(CRM_ACTIVITY_PAGE_SIZE);
  const [restState, setRestState] = useState<FeedState>({
    items: [],
    nextCursor: null,
    loading: false,
    error: null,
  });

  const basePath =
    subjectType === "contact"
      ? `/api/v1/contacts/${encodeURIComponent(subjectId ?? "")}/activity`
      : `/api/v1/organizations/${encodeURIComponent(subjectId ?? "")}/activity`;

  const reloadRest = useCallback(async () => {
    if (!enabled || !subjectId || localEnabled) return;
    setRestState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const body = await client.requestJson<{
        activities: CrmActivity[];
        nextCursor: string | null;
      }>(basePath);
      setRestState({
        items: body.activities,
        nextCursor: body.nextCursor,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (isSubjectMissingError(error)) {
        setRestState({
          items: [],
          nextCursor: null,
          loading: false,
          error: null,
        });
        return;
      }
      setRestState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load activity",
      }));
    }
  }, [basePath, client, enabled, localEnabled, subjectId]);

  useEffect(() => {
    setVisibleCount(CRM_ACTIVITY_PAGE_SIZE);
  }, [enabled, subjectId, subjectType]);

  useEffect(() => {
    if (localEnabled) return;
    setRestState({
      items: [],
      nextCursor: null,
      loading: Boolean(enabled && subjectId),
      error: null,
    });
  }, [enabled, localEnabled, subjectId]);

  useEffect(() => {
    void reloadRest();
  }, [reloadRest]);

  const localActivities = useMemo(() => {
    if (!localEnabled || !activityQuery.data) return null;
    return activityQuery.data
      .map(mapCrmActivityRow)
      .filter((row): row is CrmActivity => row != null);
  }, [activityQuery.data, localEnabled]);

  const items = localEnabled
    ? (localActivities?.slice(0, visibleCount) ?? [])
    : restState.items;
  const nextCursor = localEnabled
    ? localActivities && visibleCount < localActivities.length
      ? "local"
      : null
    : restState.nextCursor;
  const loading = localEnabled
    ? activityQuery.loading
    : restState.loading;
  const error = localEnabled
    ? activityQuery.error?.message ?? null
    : restState.error;

  const reload = useCallback(async () => {
    if (localEnabled) {
      setVisibleCount(CRM_ACTIVITY_PAGE_SIZE);
      return;
    }
    await reloadRest();
  }, [localEnabled, reloadRest]);

  const loadMore = useCallback(async () => {
    if (!enabled || !subjectId) return;
    if (localEnabled) {
      setVisibleCount((count) => count + CRM_ACTIVITY_PAGE_SIZE);
      return;
    }
    if (!restState.nextCursor) return;
    try {
      const url = `${basePath}?cursor=${encodeURIComponent(restState.nextCursor)}`;
      const body = await client.requestJson<{
        activities: CrmActivity[];
        nextCursor: string | null;
      }>(url);
      setRestState((prev) => ({
        items: [...prev.items, ...body.activities],
        nextCursor: body.nextCursor,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setRestState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to load more",
      }));
    }
  }, [
    basePath,
    client,
    enabled,
    localEnabled,
    restState.nextCursor,
    subjectId,
  ]);

  const submitNote = useCallback(
    async (body: string) => {
      if (!subjectId) return;
      await createCrmActivityNoteViaPowerSyncOrApi(client, powerSync, {
        subjectType,
        subjectId,
        body,
        activityPath: basePath,
      });
      if (!localEnabled) {
        await reloadRest();
      }
    },
    [basePath, client, localEnabled, powerSync, reloadRest, subjectId, subjectType],
  );

  return { items, nextCursor, loading, error, reload, loadMore, submitNote };
}

export function useContactRelationships(
  contactId: string | null,
  enabled: boolean,
) {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const localEnabled = useCrmLocalReads(enabled && Boolean(contactId));
  const labelsQuery = usePowerSyncQuery<CrmRelationshipLabelRow>(
    localEnabled ? CRM_RELATIONSHIP_LABELS_SQL : null,
  );
  const relationshipQuery = usePowerSyncQuery<ContactRelationshipRow>(
    localEnabled ? CONTACT_RELATIONSHIPS_FOR_CONTACT_SQL : null,
    localEnabled && contactId
      ? [contactId, contactId, contactId, contactId, contactId]
      : [],
  );
  const [restItems, setRestItems] = useState<ContactRelationshipListItem[]>([]);
  const [restLoading, setRestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadRest = useCallback(async () => {
    if (!enabled || !contactId || localEnabled) return;
    setRestLoading(true);
    setError(null);
    try {
      const body = await client.requestJson<{
        relationships: ContactRelationshipListItem[];
      }>(
        `/api/v1/contacts/${encodeURIComponent(contactId)}/relationships`,
      );
      setRestItems(body.relationships);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load relationships",
      );
    } finally {
      setRestLoading(false);
    }
  }, [client, contactId, enabled, localEnabled]);

  useEffect(() => {
    void reloadRest();
  }, [reloadRest]);

  const labels = useMemo(
    () => labelsQuery.data?.map(mapCrmRelationshipLabelRow) ?? [],
    [labelsQuery.data],
  );

  const localItems = useMemo(() => {
    if (!localEnabled || !relationshipQuery.data) return null;
    return relationshipQuery.data.map((row) =>
      mapContactRelationshipListItem(row, labels),
    );
  }, [labels, localEnabled, relationshipQuery.data]);

  const add = useCallback(
    async (input: { toContactId: string; type: string }) => {
      if (!contactId) return;
      setError(null);
      try {
        await createContactRelationshipViaPowerSyncOrApi(client, powerSync, {
          fromContactId: contactId,
          toContactId: input.toContactId,
          type: input.type,
        });
        if (!localEnabled) {
          await reloadRest();
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to save relationship";
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [client, contactId, localEnabled, powerSync, reloadRest],
  );

  const remove = useCallback(
    async (relationshipId: string) => {
      await deleteContactRelationshipViaPowerSyncOrApi(
        client,
        powerSync,
        relationshipId,
      );
      if (!localEnabled) {
        await reloadRest();
      }
    },
    [client, localEnabled, powerSync, reloadRest],
  );

  return {
    items: localEnabled ? (localItems ?? []) : restItems,
    loading: localEnabled ? relationshipQuery.loading : restLoading,
    error: localEnabled
      ? relationshipQuery.error?.message ?? null
      : error,
    reload: localEnabled ? async () => {} : reloadRest,
    add,
    remove,
  };
}

const CRM_RELATIONSHIP_LABELS_CHANGED =
  "backsteros:crm-relationship-labels-changed";

function notifyCrmRelationshipLabelsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CRM_RELATIONSHIP_LABELS_CHANGED));
}

/** Workspace bidirectional relationship label catalog. */
export function useCrmRelationshipLabels(enabled = true) {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const localEnabled = useCrmLocalReads(enabled);
  const query = usePowerSyncQuery<CrmRelationshipLabelRow>(
    localEnabled ? CRM_RELATIONSHIP_LABELS_SQL : null,
  );
  const [restLabels, setRestLabels] = useState<CrmRelationshipLabel[]>([]);
  const [restLoading, setRestLoading] = useState(false);

  const reloadRest = useCallback(async () => {
    if (!enabled || localEnabled) return;
    setRestLoading(true);
    try {
      const body = await client.requestJson<{
        labels: CrmRelationshipLabel[];
      }>("/api/v1/crm-relationship-labels");
      setRestLabels(body.labels);
    } catch {
      /* ignore cold-start */
    } finally {
      setRestLoading(false);
    }
  }, [client, enabled, localEnabled]);

  useEffect(() => {
    void reloadRest();
  }, [reloadRest]);

  useEffect(() => {
    if (!enabled || localEnabled) return;
    const onChange = () => {
      void reloadRest();
    };
    window.addEventListener(CRM_RELATIONSHIP_LABELS_CHANGED, onChange);
    return () =>
      window.removeEventListener(CRM_RELATIONSHIP_LABELS_CHANGED, onChange);
  }, [enabled, localEnabled, reloadRest]);

  const labels = useMemo(() => {
    if (localEnabled && query.data) {
      return query.data.map(mapCrmRelationshipLabelRow);
    }
    return restLabels;
  }, [localEnabled, query.data, restLabels]);

  const createLabel = useCallback(
    async (input: {
      sideALabel: string;
      sideBLabel: string;
      color?: string | null;
    }) => {
      const label = await createCrmRelationshipLabelViaPowerSyncOrApi(
        client,
        powerSync,
        input,
      );
      notifyCrmRelationshipLabelsChanged();
      if (!localEnabled) {
        await reloadRest();
      }
      return label;
    },
    [client, localEnabled, powerSync, reloadRest],
  );

  const updateLabel = useCallback(
    async (
      id: string,
      input: {
        sideALabel: string;
        sideBLabel: string;
        color?: string | null;
      },
    ) => {
      const existing = labels.find((entry) => entry.id === id);
      if (!existing) throw new Error("Relationship label not found");
      const label = await updateCrmRelationshipLabelViaPowerSyncOrApi(
        client,
        powerSync,
        { id, existing, ...input },
      );
      notifyCrmRelationshipLabelsChanged();
      if (!localEnabled) {
        await reloadRest();
      }
      return label;
    },
    [client, labels, localEnabled, powerSync, reloadRest],
  );

  const deleteLabel = useCallback(
    async (id: string) => {
      await deleteCrmRelationshipLabelViaPowerSyncOrApi(
        client,
        powerSync,
        id,
      );
      notifyCrmRelationshipLabelsChanged();
      if (!localEnabled) {
        await reloadRest();
      }
    },
    [client, localEnabled, powerSync, reloadRest],
  );

  return {
    labels,
    loading: localEnabled ? query.loading : restLoading,
    reload: localEnabled ? async () => {} : reloadRest,
    createLabel,
    updateLabel,
    deleteLabel,
  };
}

const CRM_GROUPS_CHANGED = "backsteros:crm-groups-changed";

export function notifyCrmGroupsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CRM_GROUPS_CHANGED));
}

/** Workspace CRM groups catalog for the contacts left panel (REST/Postgres). */
export function useCrmGroupsCatalog(enabled = true) {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const [restGroups, setRestGroups] = useState<CrmGroup[]>([]);
  const [serverGroups, setServerGroups] = useState<CrmGroup[] | null>(null);
  const [groupIdRedirects, setGroupIdRedirects] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [restLoading, setRestLoading] = useState(false);
  const reconcileStartedRef = useRef(false);

  const reloadRest = useCallback(async () => {
    if (!enabled) return;
    setRestLoading(true);
    try {
      const body = await client.requestJson<{ groups: CrmGroup[] }>(
        "/api/v1/crm-groups",
      );
      setRestGroups(body.groups);
      setServerGroups(body.groups);
    } catch {
      /* ignore cold-start */
    } finally {
      setRestLoading(false);
    }
  }, [client, enabled]);

  useEffect(() => {
    void reloadRest();
  }, [reloadRest]);

  useEffect(() => {
    if (!enabled || reconcileStartedRef.current) return;
    reconcileStartedRef.current = true;
    let cancelled = false;
    void (async () => {
      // One-shot cleanup of leftover PowerSync-only duplicate group rows.
      const result = await reconcileDuplicateCrmGroups(client, powerSync);
      if (cancelled) return;
      if (result.redirectGroupIds.size > 0) {
        setGroupIdRedirects(new Map(result.redirectGroupIds));
      }
      if (result.mergedGroupCount > 0 || result.movedMemberCount > 0) {
        notifyCrmGroupsChanged();
        await reloadRest();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, enabled, powerSync, reloadRest]);

  useEffect(() => {
    if (!enabled) return;
    const onChange = () => {
      void reloadRest();
    };
    window.addEventListener(CRM_GROUPS_CHANGED, onChange);
    return () => window.removeEventListener(CRM_GROUPS_CHANGED, onChange);
  }, [enabled, reloadRest]);

  const groups = useMemo(() => {
    return dedupeCatalogGroups(restGroups, serverGroups);
  }, [restGroups, serverGroups]);

  const resolveGroupId = useCallback(
    (groupId: string | null | undefined) => {
      if (!groupId) return null;
      return groupIdRedirects.get(groupId) ?? groupId;
    },
    [groupIdRedirects],
  );

  const createGroup = useCallback(
    async (input: { name: string; color?: string | null }) => {
      const group = await createCrmGroupViaPowerSyncOrApi(
        client,
        powerSync,
        input,
      );
      notifyCrmGroupsChanged();
      await reloadRest();
      return group;
    },
    [client, powerSync, reloadRest],
  );

  const updateGroup = useCallback(
    async (
      groupId: string,
      input: { name?: string; color?: string | null },
    ) => {
      const existing = groups.find((entry) => entry.id === groupId);
      if (!existing) throw new Error("Group not found");
      const group = await updateCrmGroupViaPowerSyncOrApi(client, powerSync, {
        groupId,
        existing,
        ...input,
      });
      notifyCrmGroupsChanged();
      await reloadRest();
      return group;
    },
    [client, groups, powerSync, reloadRest],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      await deleteCrmGroupViaPowerSyncOrApi(client, powerSync, groupId);
      notifyCrmGroupsChanged();
      await reloadRest();
    },
    [client, powerSync, reloadRest],
  );

  return {
    groups,
    resolveGroupId,
    loading: restLoading,
    createGroup,
    updateGroup,
    deleteGroup,
    reload: reloadRest,
  };
}

export type CrmContactGroupChip = {
  id: string;
  name: string;
  color: string | null;
};

type CrmGroupMemberApiRow = {
  id: string;
  subjectType: string;
  subjectId: string;
};

/** Map of contact id → CRM groups for list chips (REST/Postgres). */
export function useCrmContactGroupsByContactId(enabled = true) {
  const { client } = useDesktopApi();
  const [map, setMap] = useState<Map<string, CrmContactGroupChip[]>>(
    () => new Map(),
  );

  const reload = useCallback(async () => {
    if (!enabled) {
      setMap(new Map());
      return;
    }
    try {
      const groupsBody = await client.requestJson<{ groups: CrmGroup[] }>(
        "/api/v1/crm-groups",
      );
      const groups = groupsBody.groups ?? [];
      const next = new Map<string, CrmContactGroupChip[]>();
      await Promise.all(
        groups.map(async (group) => {
          const membersBody = await client.requestJson<{
            members: CrmGroupMemberApiRow[];
          }>(`/api/v1/crm-groups/${encodeURIComponent(group.id)}/members`);
          const chip: CrmContactGroupChip = {
            id: group.id,
            name: group.name,
            color: group.color,
          };
          for (const member of membersBody.members ?? []) {
            if (member.subjectType !== "contact" || !member.subjectId) continue;
            const existing = next.get(member.subjectId);
            if (existing) existing.push(chip);
            else next.set(member.subjectId, [chip]);
          }
        }),
      );
      setMap(next);
    } catch {
      setMap(new Map());
    }
  }, [client, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled) return;
    const onChange = () => {
      void reload();
    };
    window.addEventListener(CRM_GROUPS_CHANGED, onChange);
    return () => window.removeEventListener(CRM_GROUPS_CHANGED, onChange);
  }, [enabled, reload]);

  return map;
}

type CrmGroupMembersState = {
  contactIds: Set<string>;
  organizationIds: Set<string>;
  loading: boolean;
  reload: () => Promise<void>;
};

function useCrmGroupMembers(
  groupId: string | null,
  enabled: boolean,
): CrmGroupMembersState {
  const { client } = useDesktopApi();
  const [contactIds, setContactIds] = useState<Set<string>>(() => new Set());
  const [organizationIds, setOrganizationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !groupId) {
      setContactIds(new Set());
      setOrganizationIds(new Set());
      return;
    }
    setLoading(true);
    try {
      const body = await client.requestJson<{
        members: CrmGroupMemberApiRow[];
      }>(`/api/v1/crm-groups/${encodeURIComponent(groupId)}/members`);
      const nextContacts = new Set<string>();
      const nextOrgs = new Set<string>();
      for (const member of body.members ?? []) {
        if (!member.subjectId) continue;
        if (member.subjectType === "contact") nextContacts.add(member.subjectId);
        if (member.subjectType === "organization") nextOrgs.add(member.subjectId);
      }
      setContactIds(nextContacts);
      setOrganizationIds(nextOrgs);
    } catch {
      setContactIds(new Set());
      setOrganizationIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [client, enabled, groupId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled || !groupId) return;
    const onChange = () => {
      void reload();
    };
    window.addEventListener(CRM_GROUPS_CHANGED, onChange);
    return () => window.removeEventListener(CRM_GROUPS_CHANGED, onChange);
  }, [enabled, groupId, reload]);

  return { contactIds, organizationIds, loading, reload };
}

/**
 * Contact + organization ids that belong to a CRM group (REST/Postgres).
 * Portal client picker uses the same membership table and expands org members.
 */
export function useCrmGroupContactIds(
  groupId: string | null,
  enabled: boolean,
) {
  const members = useCrmGroupMembers(groupId, enabled);
  return {
    contactIds: members.contactIds,
    organizationIds: members.organizationIds,
    loading: members.loading,
    reload: members.reload,
  };
}

/** Organization ids that belong to a CRM group (contacts ignored for catalog filter). */
export function useCrmGroupOrganizationIds(
  groupId: string | null,
  enabled: boolean,
) {
  const members = useCrmGroupMembers(groupId, enabled);
  return {
    organizationIds: members.organizationIds,
    loading: members.loading,
    reload: members.reload,
  };
}

export function useCrmGroupsForSubject(
  subjectType: CrmGroupSubjectType,
  subjectId: string | null,
  enabled: boolean,
) {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const [restAllGroups, setRestAllGroups] = useState<CrmGroup[]>([]);
  const [restMemberGroups, setRestMemberGroups] = useState<CrmGroup[]>([]);

  const reloadRest = useCallback(async () => {
    if (!enabled || !subjectId) return;
    const allBody = await client.requestJson<{ groups: CrmGroup[] }>(
      "/api/v1/crm-groups",
    );
    setRestAllGroups(allBody.groups);
    try {
      const memberBody = await client.requestJson<{ groups: CrmGroup[] }>(
        subjectType === "contact"
          ? `/api/v1/contacts/${encodeURIComponent(subjectId)}/groups`
          : `/api/v1/organizations/${encodeURIComponent(subjectId)}/groups`,
      );
      setRestMemberGroups(memberBody.groups);
    } catch (error) {
      if (isSubjectMissingError(error)) {
        setRestMemberGroups([]);
        return;
      }
      throw error;
    }
  }, [client, enabled, subjectId, subjectType]);

  useEffect(() => {
    void reloadRest().catch(() => {
      /* ignore cold-start */
    });
  }, [reloadRest]);

  useEffect(() => {
    if (!enabled) return;
    const onChange = () => {
      void reloadRest().catch(() => {});
    };
    window.addEventListener(CRM_GROUPS_CHANGED, onChange);
    return () => window.removeEventListener(CRM_GROUPS_CHANGED, onChange);
  }, [enabled, reloadRest]);

  const createGroup = useCallback(
    async (input: { name: string; color?: string | null }) => {
      const group = await createCrmGroupViaPowerSyncOrApi(
        client,
        powerSync,
        input,
      );
      if (subjectId) {
        await addCrmGroupMemberWithRetry(client, powerSync, {
          groupId: group.id,
          subjectType,
          subjectId,
        });
      }
      notifyCrmGroupsChanged();
      await reloadRest();
    },
    [client, powerSync, reloadRest, subjectId, subjectType],
  );

  const toggleMembership = useCallback(
    async (groupId: string, member: boolean) => {
      if (!subjectId) return;
      if (member) {
        await addCrmGroupMemberWithRetry(client, powerSync, {
          groupId,
          subjectType,
          subjectId,
        });
      } else {
        await removeCrmGroupMemberViaPowerSyncOrApi(client, powerSync, {
          groupId,
          subjectType,
          subjectId,
        });
      }
      notifyCrmGroupsChanged();
      await reloadRest();
    },
    [client, powerSync, reloadRest, subjectId, subjectType],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      await deleteCrmGroupViaPowerSyncOrApi(client, powerSync, groupId);
      notifyCrmGroupsChanged();
      await reloadRest();
    },
    [client, powerSync, reloadRest],
  );

  return {
    allGroups: restAllGroups,
    memberGroups: restMemberGroups,
    createGroup,
    toggleMembership,
    deleteGroup,
    reload: reloadRest,
  };
}

