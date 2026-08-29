import { useCallback, useEffect, useState } from "react";

import type {
  ContactRelationshipListItem,
  ContactRelationshipType,
  CrmActivity,
  CrmGroup,
  CrmGroupSubjectType,
} from "@backsteros/contracts";

import { useDesktopApi } from "./api-context";

type FeedState = {
  items: CrmActivity[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

export function useCrmActivityFeed(
  subjectType: CrmGroupSubjectType,
  subjectId: string | null,
  enabled: boolean,
) {
  const { client } = useDesktopApi();
  const [state, setState] = useState<FeedState>({
    items: [],
    nextCursor: null,
    loading: false,
    error: null,
  });

  const basePath =
    subjectType === "contact"
      ? `/api/v1/contacts/${encodeURIComponent(subjectId ?? "")}/activity`
      : `/api/v1/organizations/${encodeURIComponent(subjectId ?? "")}/activity`;

  const reload = useCallback(async () => {
    if (!enabled || !subjectId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const body = await client.requestJson<{
        activities: CrmActivity[];
        nextCursor: string | null;
      }>(basePath);
      setState({
        items: body.activities,
        nextCursor: body.nextCursor,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load activity",
      }));
    }
  }, [basePath, client, enabled, subjectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!enabled || !subjectId || !state.nextCursor) return;
    try {
      const url = `${basePath}?cursor=${encodeURIComponent(state.nextCursor)}`;
      const body = await client.requestJson<{
        activities: CrmActivity[];
        nextCursor: string | null;
      }>(url);
      setState((prev) => ({
        items: [...prev.items, ...body.activities],
        nextCursor: body.nextCursor,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to load more",
      }));
    }
  }, [basePath, client, enabled, state.nextCursor, subjectId]);

  const submitNote = useCallback(
    async (body: string) => {
      if (!subjectId) return;
      await client.requestJson<CrmActivity>(basePath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "note", body }),
      });
      await reload();
    },
    [basePath, client, reload, subjectId],
  );

  return { ...state, reload, loadMore, submitNote };
}

export function useContactRelationships(
  contactId: string | null,
  enabled: boolean,
) {
  const { client } = useDesktopApi();
  const [items, setItems] = useState<ContactRelationshipListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !contactId) return;
    setLoading(true);
    setError(null);
    try {
      const body = await client.requestJson<{
        relationships: ContactRelationshipListItem[];
      }>(
        `/api/v1/contacts/${encodeURIComponent(contactId)}/relationships`,
      );
      setItems(body.relationships);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load relationships");
    } finally {
      setLoading(false);
    }
  }, [client, contactId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(
    async (input: { toContactId: string; type: ContactRelationshipType }) => {
      if (!contactId) return;
      await client.requestJson(
        `/api/v1/contacts/${encodeURIComponent(contactId)}/relationships`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      await reload();
    },
    [client, contactId, reload],
  );

  const remove = useCallback(
    async (relationshipId: string) => {
      await client.requestJson(
        `/api/v1/contact-relationships/${encodeURIComponent(relationshipId)}`,
        { method: "DELETE" },
      );
      await reload();
    },
    [client, reload],
  );

  return { items, loading, error, reload, add, remove };
}

const CRM_GROUPS_CHANGED = "backsteros:crm-groups-changed";

function notifyCrmGroupsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CRM_GROUPS_CHANGED));
}

/** Workspace CRM groups catalog for the contacts left panel. */
export function useCrmGroupsCatalog(enabled = true) {
  const { client } = useDesktopApi();
  const [groups, setGroups] = useState<CrmGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const body = await client.requestJson<{ groups: CrmGroup[] }>(
        "/api/v1/crm-groups",
      );
      setGroups(body.groups);
    } catch {
      /* ignore cold-start */
    } finally {
      setLoading(false);
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

  const createGroup = useCallback(
    async (input: { name: string; color?: string | null }) => {
      const group = await client.requestJson<CrmGroup>("/api/v1/crm-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          color: input.color ?? null,
        }),
      });
      notifyCrmGroupsChanged();
      await reload();
      return group;
    },
    [client, reload],
  );

  return { groups, loading, createGroup, reload };
}

/** Contact ids that belong to a CRM group (organizations ignored for catalog filter). */
export function useCrmGroupContactIds(
  groupId: string | null,
  enabled: boolean,
) {
  const { client } = useDesktopApi();
  const [contactIds, setContactIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !groupId) {
      setContactIds(new Set());
      return;
    }
    setLoading(true);
    try {
      const body = await client.requestJson<{
        members: { subjectType: string; subjectId: string }[];
      }>(`/api/v1/crm-groups/${encodeURIComponent(groupId)}/members`);
      setContactIds(
        new Set(
          body.members
            .filter((row) => row.subjectType === "contact")
            .map((row) => row.subjectId),
        ),
      );
    } catch {
      setContactIds(new Set());
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

  return { contactIds, loading, reload };
}

export function useCrmGroupsForSubject(
  subjectType: CrmGroupSubjectType,
  subjectId: string | null,
  enabled: boolean,
) {
  const { client } = useDesktopApi();
  const [allGroups, setAllGroups] = useState<CrmGroup[]>([]);
  const [memberGroups, setMemberGroups] = useState<CrmGroup[]>([]);

  const reload = useCallback(async () => {
    if (!enabled || !subjectId) return;
    const [allBody, memberBody] = await Promise.all([
      client.requestJson<{ groups: CrmGroup[] }>("/api/v1/crm-groups"),
      client.requestJson<{ groups: CrmGroup[] }>(
        subjectType === "contact"
          ? `/api/v1/contacts/${encodeURIComponent(subjectId)}/groups`
          : `/api/v1/organizations/${encodeURIComponent(subjectId)}/groups`,
      ),
    ]);
    setAllGroups(allBody.groups);
    setMemberGroups(memberBody.groups);
  }, [client, enabled, subjectId, subjectType]);

  useEffect(() => {
    void reload().catch(() => {
      /* ignore cold-start */
    });
  }, [reload]);

  useEffect(() => {
    if (!enabled) return;
    const onChange = () => {
      void reload().catch(() => {});
    };
    window.addEventListener(CRM_GROUPS_CHANGED, onChange);
    return () => window.removeEventListener(CRM_GROUPS_CHANGED, onChange);
  }, [enabled, reload]);

  const createGroup = useCallback(
    async (input: { name: string; color?: string | null }) => {
      const group = await client.requestJson<CrmGroup>("/api/v1/crm-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          color: input.color ?? null,
        }),
      });
      if (subjectId) {
        await client.requestJson(
          `/api/v1/crm-groups/${encodeURIComponent(group.id)}/members`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subjectType, subjectId }),
          },
        );
      }
      notifyCrmGroupsChanged();
      await reload();
    },
    [client, reload, subjectId, subjectType],
  );

  const toggleMembership = useCallback(
    async (groupId: string, member: boolean) => {
      if (!subjectId) return;
      if (member) {
        await client.requestJson(
          `/api/v1/crm-groups/${encodeURIComponent(groupId)}/members`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subjectType, subjectId }),
          },
        );
      } else {
        const members = await client.requestJson<{
          members: { id: string; subjectId: string }[];
        }>(`/api/v1/crm-groups/${encodeURIComponent(groupId)}/members`);
        const row = members.members.find((entry) => entry.subjectId === subjectId);
        if (row) {
          await client.requestJson(
            `/api/v1/crm-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(row.id)}`,
            { method: "DELETE" },
          );
        }
      }
      notifyCrmGroupsChanged();
      await reload();
    },
    [client, reload, subjectId, subjectType],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      await client.requestJson(
        `/api/v1/crm-groups/${encodeURIComponent(groupId)}`,
        { method: "DELETE" },
      );
      notifyCrmGroupsChanged();
      await reload();
    },
    [client, reload],
  );

  return {
    allGroups,
    memberGroups,
    createGroup,
    toggleMembership,
    deleteGroup,
    reload,
  };
}
