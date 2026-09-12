import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiClientError } from "@backsteros/api-client";
import type {
  ContactRelationshipListItem,
  ContactRelationshipType,
  CrmActivity,
  CrmGroup,
  CrmGroupSubjectType,
} from "@backsteros/contracts";

import {
  addCrmGroupMemberWithRetry,
  createContactRelationshipViaPowerSyncOrApi,
  createCrmActivityNoteViaPowerSyncOrApi,
  createCrmGroupViaPowerSyncOrApi,
  deleteContactRelationshipViaPowerSyncOrApi,
  removeCrmGroupMemberViaPowerSyncOrApi,
} from "./crm-mutations";
import {
  mapContactRelationshipListItem,
  mapCrmActivityRow,
  type ContactRelationshipRow,
  type CrmActivityRow,
  type CrmRelationshipLabelRow,
} from "./crm-row-mappers";
import {
  formatMobileUserFacingError,
  isMobileApiNetworkError,
} from "./probe-core-health";
import { useLocalQuery } from "./use-local-query";
import { useMobileApiClient } from "./use-mobile-api-client";
import { useMobilePowerSync } from "./powersync-context";

type FeedState = {
  items: CrmActivity[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

const CRM_ACTIVITY_PAGE_SIZE = 30;

const CRM_ACTIVITIES_SQL = `
  SELECT
    a.id,
    a.subject_type,
    a.subject_id,
    a.kind,
    a.body,
    a.body_preview,
    a.meeting_id,
    a.occurred_at,
    a.created_by,
    a.created_at,
    a.updated_at,
    a.deleted_at,
    m.title AS meeting_title,
    m.start_at AS meeting_start_at
  FROM crm_activities a
  LEFT JOIN meetings m ON m.id = a.meeting_id AND m.deleted_at IS NULL
  WHERE a.deleted_at IS NULL
    AND a.subject_type = ?
    AND a.subject_id = ?
  ORDER BY a.occurred_at DESC, a.id DESC
`.trim();

const CRM_RELATIONSHIP_LABELS_SQL = `
  SELECT
    id, side_a_label, side_a_slug, side_b_label, side_b_slug,
    color, sort_order, created_at, updated_at, deleted_at
  FROM crm_relationship_labels
  WHERE deleted_at IS NULL
  ORDER BY sort_order ASC, side_a_label COLLATE NOCASE ASC
`.trim();

const CONTACT_RELATIONSHIPS_SQL = `
  SELECT
    r.id, r.from_contact_id, r.to_contact_id, r.type, r.note,
    r.created_at, r.updated_at, r.deleted_at,
    CASE WHEN r.from_contact_id = ? THEN 'outgoing' ELSE 'incoming' END AS direction,
    CASE WHEN r.from_contact_id = ? THEN r.to_contact_id ELSE r.from_contact_id END AS related_contact_id,
    COALESCE(c.name, 'Unknown') AS related_contact_name
  FROM contact_relationships r
  LEFT JOIN contacts c
    ON c.id = CASE WHEN r.from_contact_id = ? THEN r.to_contact_id ELSE r.from_contact_id END
    AND c.deleted_at IS NULL
  WHERE r.deleted_at IS NULL
    AND (r.from_contact_id = ? OR r.to_contact_id = ?)
  ORDER BY r.created_at ASC
`.trim();

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
  const client = useMobileApiClient();
  const clientRef = useRef(client);
  clientRef.current = client;
  const powerSync = useMobilePowerSync();
  const localEnabled = Boolean(enabled && subjectId && powerSync.ready);
  const activityQuery = useLocalQuery<CrmActivityRow>(
    CRM_ACTIVITIES_SQL,
    localEnabled && subjectId ? [subjectType, subjectId] : ["", ""],
  );
  const [visibleCount, setVisibleCount] = useState(CRM_ACTIVITY_PAGE_SIZE);
  const [restState, setRestState] = useState<FeedState>({
    items: [],
    nextCursor: null,
    loading: true,
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
      const body = await clientRef.current.requestJson<{
        activities: CrmActivity[];
        nextCursor: string | null;
      }>(basePath);
      setRestState({
        items: Array.isArray(body.activities) ? body.activities : [],
        nextCursor: body.nextCursor ?? null,
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
      const message =
        error instanceof Error ? error.message : "Failed to load activity";
      // Background hydrate while offline — don't flash Expo fetch noise.
      if (isMobileApiNetworkError(message)) {
        setRestState((prev) => ({
          ...prev,
          loading: false,
          error: null,
        }));
        return;
      }
      setRestState((prev) => ({
        ...prev,
        loading: false,
        error: formatMobileUserFacingError(error, "Failed to load activity"),
      }));
    }
  }, [basePath, enabled, localEnabled, subjectId]);

  useEffect(() => {
    setVisibleCount(CRM_ACTIVITY_PAGE_SIZE);
  }, [enabled, subjectId, subjectType]);

  useEffect(() => {
    void reloadRest();
  }, [reloadRest]);

  const localActivities = useMemo(() => {
    if (!localEnabled) return null;
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
  const loading = localEnabled ? activityQuery.isLoading : restState.loading;
  const error = localEnabled ? null : restState.error;

  const loadMore = useCallback(async () => {
    if (!enabled || !subjectId) return;
    if (localEnabled) {
      setVisibleCount((count) => count + CRM_ACTIVITY_PAGE_SIZE);
      return;
    }
    const cursor = restState.nextCursor;
    if (!cursor) return;
    try {
      const url = `${basePath}?cursor=${encodeURIComponent(cursor)}`;
      const body = await clientRef.current.requestJson<{
        activities: CrmActivity[];
        nextCursor: string | null;
      }>(url);
      setRestState((prev) => ({
        items: [...prev.items, ...body.activities],
        nextCursor: body.nextCursor,
        loading: false,
        error: null,
      }));
    } catch (err) {
      setRestState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to load more",
      }));
    }
  }, [basePath, enabled, localEnabled, restState.nextCursor, subjectId]);

  const submitNote = useCallback(
    async (body: string) => {
      if (!subjectId) return;
      await createCrmActivityNoteViaPowerSyncOrApi(clientRef.current, powerSync, {
        subjectType,
        subjectId,
        body,
        activityPath: basePath,
      });
      if (!localEnabled) await reloadRest();
    },
    [basePath, localEnabled, powerSync, reloadRest, subjectId, subjectType],
  );

  return {
    items,
    nextCursor,
    loading,
    error,
    reload: localEnabled ? async () => {} : reloadRest,
    loadMore,
    submitNote,
  };
}

export function useContactRelationships(
  contactId: string | null,
  enabled: boolean,
) {
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const localEnabled = Boolean(enabled && contactId && powerSync.ready);
  const labelsQuery = useLocalQuery<CrmRelationshipLabelRow>(
    CRM_RELATIONSHIP_LABELS_SQL,
  );
  const relationshipQuery = useLocalQuery<ContactRelationshipRow>(
    CONTACT_RELATIONSHIPS_SQL,
    localEnabled && contactId
      ? [contactId, contactId, contactId, contactId, contactId]
      : ["", "", "", "", ""],
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
      }>(`/api/v1/contacts/${encodeURIComponent(contactId)}/relationships`);
      setRestItems(body.relationships);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load relationships";
      if (isMobileApiNetworkError(message)) {
        setError(null);
        return;
      }
      setError(
        formatMobileUserFacingError(err, "Failed to load relationships"),
      );
    } finally {
      setRestLoading(false);
    }
  }, [client, contactId, enabled, localEnabled]);

  useEffect(() => {
    void reloadRest();
  }, [reloadRest]);

  const labels = useMemo(
    () => labelsQuery.data.map((row) => ({
      id: row.id,
      workspaceId: "",
      sideALabel: row.side_a_label,
      sideASlug: row.side_a_slug,
      sideBLabel: row.side_b_label,
      sideBSlug: row.side_b_slug,
      color: row.color,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    })),
    [labelsQuery.data],
  );

  const localItems = useMemo(() => {
    if (!localEnabled) return null;
    return relationshipQuery.data.map((row) =>
      mapContactRelationshipListItem(row, labels),
    );
  }, [labels, localEnabled, relationshipQuery.data]);

  const add = useCallback(
    async (input: { toContactId: string; type: ContactRelationshipType }) => {
      if (!contactId) return;
      await createContactRelationshipViaPowerSyncOrApi(client, powerSync, {
        fromContactId: contactId,
        toContactId: input.toContactId,
        type: input.type,
      });
      if (!localEnabled) await reloadRest();
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
      if (!localEnabled) await reloadRest();
    },
    [client, localEnabled, powerSync, reloadRest],
  );

  return {
    items: localEnabled ? (localItems ?? []) : restItems,
    loading: localEnabled ? relationshipQuery.isLoading : restLoading,
    error: localEnabled ? null : error,
    reload: localEnabled ? async () => {} : reloadRest,
    add,
    remove,
  };
}

export function useCrmGroupsForSubject(
  subjectType: CrmGroupSubjectType,
  subjectId: string | null,
  enabled: boolean,
) {
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
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
      await reloadRest();
    },
    [client, powerSync, reloadRest, subjectId, subjectType],
  );

  return {
    allGroups: restAllGroups,
    memberGroups: restMemberGroups,
    createGroup,
    toggleMembership,
    reload: reloadRest,
  };
}

