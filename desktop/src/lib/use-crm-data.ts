import { useCallback, useEffect, useMemo, useState } from "react";

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
  mapCrmGroupMemberSubjectIds,
  mapCrmGroupRow,
  mapCrmRelationshipLabelRow,
  type ContactRelationshipRow,
  type CrmActivityRow,
  type CrmGroupMemberRow,
  type CrmGroupRow,
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
  CONTACT_RELATIONSHIPS_FOR_CONTACT_SQL,
  CRM_ACTIVITIES_FOR_SUBJECT_SQL,
  CRM_CONTACT_GROUP_MEMBERSHIPS_SQL,
  CRM_GROUP_MEMBERS_SQL,
  CRM_GROUPS_LIST_SQL,
  CRM_RELATIONSHIP_LABELS_SQL,
  CRM_SUBJECT_GROUPS_SQL,
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
      await createContactRelationshipViaPowerSyncOrApi(client, powerSync, {
        fromContactId: contactId,
        toContactId: input.toContactId,
        type: input.type,
      });
      if (!localEnabled) {
        await reloadRest();
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

/** Workspace CRM groups catalog for the contacts left panel. */
export function useCrmGroupsCatalog(enabled = true) {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const localEnabled = useCrmLocalReads(enabled);
  const query = usePowerSyncQuery<CrmGroupRow>(
    localEnabled ? CRM_GROUPS_LIST_SQL : null,
  );
  const [restGroups, setRestGroups] = useState<CrmGroup[]>([]);
  const [restLoading, setRestLoading] = useState(false);

  const reloadRest = useCallback(async () => {
    if (!enabled || localEnabled) return;
    setRestLoading(true);
    try {
      const body = await client.requestJson<{ groups: CrmGroup[] }>(
        "/api/v1/crm-groups",
      );
      setRestGroups(body.groups);
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
    window.addEventListener(CRM_GROUPS_CHANGED, onChange);
    return () => window.removeEventListener(CRM_GROUPS_CHANGED, onChange);
  }, [enabled, localEnabled, reloadRest]);

  const groups = useMemo(() => {
    if (localEnabled && query.data) {
      return query.data.map(mapCrmGroupRow);
    }
    return restGroups;
  }, [localEnabled, query.data, restGroups]);

  const createGroup = useCallback(
    async (input: { name: string; color?: string | null }) => {
      const group = await createCrmGroupViaPowerSyncOrApi(
        client,
        powerSync,
        input,
      );
      notifyCrmGroupsChanged();
      if (!localEnabled) {
        await reloadRest();
      }
      return group;
    },
    [client, localEnabled, powerSync, reloadRest],
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
      if (!localEnabled) {
        await reloadRest();
      }
      return group;
    },
    [client, groups, localEnabled, powerSync, reloadRest],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      await deleteCrmGroupViaPowerSyncOrApi(client, powerSync, groupId);
      notifyCrmGroupsChanged();
      if (!localEnabled) {
        await reloadRest();
      }
    },
    [client, localEnabled, powerSync, reloadRest],
  );

  return {
    groups,
    loading: localEnabled ? query.loading : restLoading,
    createGroup,
    updateGroup,
    deleteGroup,
    reload: localEnabled ? async () => {} : reloadRest,
  };
}

export type CrmContactGroupChip = {
  id: string;
  name: string;
  color: string | null;
};

type CrmContactGroupMembershipRow = {
  contact_id: string;
  group_id: string;
  name: string;
  color: string | null;
  sort_order: number;
};

/** Map of contact id → CRM groups for list chips (PowerSync). */
export function useCrmContactGroupsByContactId(enabled = true) {
  const query = usePowerSyncQuery<CrmContactGroupMembershipRow>(
    enabled ? CRM_CONTACT_GROUP_MEMBERSHIPS_SQL : null,
  );

  return useMemo(() => {
    const map = new Map<string, CrmContactGroupChip[]>();
    for (const row of query.data ?? []) {
      const chip: CrmContactGroupChip = {
        id: row.group_id,
        name: row.name,
        color: row.color,
      };
      const existing = map.get(row.contact_id);
      if (existing) existing.push(chip);
      else map.set(row.contact_id, [chip]);
    }
    return map;
  }, [query.data]);
}

/** Contact ids that belong to a CRM group (organizations ignored for catalog filter). */
export function useCrmGroupContactIds(
  groupId: string | null,
  enabled: boolean,
) {
  const { client } = useDesktopApi();
  const localEnabled = useCrmLocalReads(enabled && Boolean(groupId));
  const query = usePowerSyncQuery<CrmGroupMemberRow>(
    localEnabled ? CRM_GROUP_MEMBERS_SQL : null,
    localEnabled && groupId ? [groupId] : [],
  );
  const [restContactIds, setRestContactIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [restLoading, setRestLoading] = useState(false);

  const reloadRest = useCallback(async () => {
    if (!enabled || !groupId || localEnabled) {
      setRestContactIds(new Set());
      return;
    }
    setRestLoading(true);
    try {
      const body = await client.requestJson<{
        members: { subjectType: string; subjectId: string }[];
      }>(`/api/v1/crm-groups/${encodeURIComponent(groupId)}/members`);
      setRestContactIds(
        new Set(
          body.members
            .filter((row) => row.subjectType === "contact")
            .map((row) => row.subjectId),
        ),
      );
    } catch {
      setRestContactIds(new Set());
    } finally {
      setRestLoading(false);
    }
  }, [client, enabled, groupId, localEnabled]);

  useEffect(() => {
    void reloadRest();
  }, [reloadRest]);

  useEffect(() => {
    if (!enabled || !groupId || localEnabled) return;
    const onChange = () => {
      void reloadRest();
    };
    window.addEventListener(CRM_GROUPS_CHANGED, onChange);
    return () => window.removeEventListener(CRM_GROUPS_CHANGED, onChange);
  }, [enabled, groupId, localEnabled, reloadRest]);

  const contactIds = useMemo(() => {
    if (localEnabled && query.data) {
      return mapCrmGroupMemberSubjectIds(query.data, "contact");
    }
    return restContactIds;
  }, [localEnabled, query.data, restContactIds]);

  return {
    contactIds,
    loading: localEnabled ? query.loading : restLoading,
    reload: localEnabled ? async () => {} : reloadRest,
  };
}

/** Organization ids that belong to a CRM group (contacts ignored for catalog filter). */
export function useCrmGroupOrganizationIds(
  groupId: string | null,
  enabled: boolean,
) {
  const { client } = useDesktopApi();
  const localEnabled = useCrmLocalReads(enabled && Boolean(groupId));
  const query = usePowerSyncQuery<CrmGroupMemberRow>(
    localEnabled ? CRM_GROUP_MEMBERS_SQL : null,
    localEnabled && groupId ? [groupId] : [],
  );
  const [restOrganizationIds, setRestOrganizationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [restLoading, setRestLoading] = useState(false);

  const reloadRest = useCallback(async () => {
    if (!enabled || !groupId || localEnabled) {
      setRestOrganizationIds(new Set());
      return;
    }
    setRestLoading(true);
    try {
      const body = await client.requestJson<{
        members: { subjectType: string; subjectId: string }[];
      }>(`/api/v1/crm-groups/${encodeURIComponent(groupId)}/members`);
      setRestOrganizationIds(
        new Set(
          body.members
            .filter((row) => row.subjectType === "organization")
            .map((row) => row.subjectId),
        ),
      );
    } catch {
      setRestOrganizationIds(new Set());
    } finally {
      setRestLoading(false);
    }
  }, [client, enabled, groupId, localEnabled]);

  useEffect(() => {
    void reloadRest();
  }, [reloadRest]);

  useEffect(() => {
    if (!enabled || !groupId || localEnabled) return;
    const onChange = () => {
      void reloadRest();
    };
    window.addEventListener(CRM_GROUPS_CHANGED, onChange);
    return () => window.removeEventListener(CRM_GROUPS_CHANGED, onChange);
  }, [enabled, groupId, localEnabled, reloadRest]);

  const organizationIds = useMemo(() => {
    if (localEnabled && query.data) {
      return mapCrmGroupMemberSubjectIds(query.data, "organization");
    }
    return restOrganizationIds;
  }, [localEnabled, query.data, restOrganizationIds]);

  return {
    organizationIds,
    loading: localEnabled ? query.loading : restLoading,
    reload: localEnabled ? async () => {} : reloadRest,
  };
}

export function useCrmGroupsForSubject(
  subjectType: CrmGroupSubjectType,
  subjectId: string | null,
  enabled: boolean,
) {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const localEnabled = useCrmLocalReads(enabled && Boolean(subjectId));
  const allGroupsQuery = usePowerSyncQuery<CrmGroupRow>(
    localEnabled ? CRM_GROUPS_LIST_SQL : null,
  );
  const memberGroupsQuery = usePowerSyncQuery<CrmGroupRow>(
    localEnabled ? CRM_SUBJECT_GROUPS_SQL : null,
    localEnabled && subjectId ? [subjectType, subjectId] : [],
  );
  const [restAllGroups, setRestAllGroups] = useState<CrmGroup[]>([]);
  const [restMemberGroups, setRestMemberGroups] = useState<CrmGroup[]>([]);

  const reloadRest = useCallback(async () => {
    if (!enabled || !subjectId || localEnabled) return;
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
  }, [client, enabled, localEnabled, subjectId, subjectType]);

  useEffect(() => {
    void reloadRest().catch(() => {
      /* ignore cold-start */
    });
  }, [reloadRest]);

  useEffect(() => {
    if (!enabled || localEnabled) return;
    const onChange = () => {
      void reloadRest().catch(() => {});
    };
    window.addEventListener(CRM_GROUPS_CHANGED, onChange);
    return () => window.removeEventListener(CRM_GROUPS_CHANGED, onChange);
  }, [enabled, localEnabled, reloadRest]);

  const allGroups = useMemo(() => {
    if (localEnabled && allGroupsQuery.data) {
      return allGroupsQuery.data.map(mapCrmGroupRow);
    }
    return restAllGroups;
  }, [allGroupsQuery.data, localEnabled, restAllGroups]);

  const memberGroups = useMemo(() => {
    if (localEnabled && memberGroupsQuery.data) {
      return memberGroupsQuery.data.map(mapCrmGroupRow);
    }
    return restMemberGroups;
  }, [localEnabled, memberGroupsQuery.data, restMemberGroups]);

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
      if (!localEnabled) {
        await reloadRest();
      }
    },
    [client, localEnabled, powerSync, reloadRest, subjectId, subjectType],
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
      if (!localEnabled) {
        await reloadRest();
      }
    },
    [client, localEnabled, powerSync, reloadRest, subjectId, subjectType],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      await deleteCrmGroupViaPowerSyncOrApi(client, powerSync, groupId);
      notifyCrmGroupsChanged();
      if (!localEnabled) {
        await reloadRest();
      }
    },
    [client, localEnabled, powerSync, reloadRest],
  );

  return {
    allGroups,
    memberGroups,
    createGroup,
    toggleMembership,
    deleteGroup,
    reload: localEnabled ? async () => {} : reloadRest,
  };
}
