import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getContactEmailAddresses,
  type MapboxGeocodeResult,
  type MapboxSettings,
} from "@backsteros/contracts";

import {
  AvatarUpload,
  ContactDetailOverlay,
  ContactDetailView,
  ContactRelationshipsListView,
  ContactTasksListView,
  ContactsOverviewView,
  CONTACT_SECTIONS,
  CrmActivityFeedView,
  EntityDetailLayout,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  ScopedLettersListView,
  buildSourceTaskTrailHref,
  contactMatchesSlug,
  formatContactAddressLine,
  getContactOverlayHref,
  getContactsGroupHref,
  getEmailComposeHref,
  getOrganizationSectionHref,
  getScopedContactBasePath,
  getScopedContactLetterHref,
  getScopedContactSectionHref,
  getScopedContactsListHref,
  getUniqueListItemRouteParam,
  isContactSectionId,
  isHabitLinkedTask,
  migrateLegacyTaskStatus,
  parseContactSectionId,
  parseCrmGroupId,
  requestOpenComposeModal,
  resolveCountryOption,
  shouldHandleGlobalShortcut,
  type ContactListItem,
  type ContactLocationParts,
  type ContactOverviewDetails,
  type ContactRouteScope,
  type ContactSectionId,
  type TaskStatus,
  taskReorderPatches,
} from "@backsteros/ui";

import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../lib/avatar-upload";
import {
  resetEmailComposeSession,
  writeEmailComposeSession,
} from "../lib/email-compose-session";
import {
  useContactRelationships,
  useCrmActivityFeed,
  useCrmGroupContactIds,
  useCrmGroupsCatalog,
  useCrmGroupsForSubject,
} from "../lib/use-crm-data";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

function contactSlug(contact: {
  number?: number | null;
  key?: string | null;
  id: string;
}) {
  return contact.number ?? contact.key ?? contact.id;
}

function normalizeContactSocialAccounts(
  raw: unknown,
): { platform: string; url: string }[] {
  let accounts: unknown = raw ?? [];
  if (typeof accounts === "string") {
    try {
      accounts = JSON.parse(accounts) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(accounts)) return [];
  return accounts
    .filter(
      (entry): entry is { platform: unknown; url: unknown } =>
        entry != null &&
        typeof entry === "object" &&
        "platform" in entry &&
        "url" in entry,
    )
    .map((entry) => ({
      platform: String(entry.platform ?? ""),
      url: String(entry.url ?? ""),
    }))
    .filter((entry) => entry.platform.length > 0 && entry.url.length > 0)
    .slice(0, 20);
}

function normalizeContactEmails(
  raw: unknown,
): { label: "personal" | "work" | "other"; address: string }[] {
  let emails: unknown = raw ?? [];
  if (typeof emails === "string") {
    try {
      emails = JSON.parse(emails) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(emails)) return [];
  const out: { label: "personal" | "work" | "other"; address: string }[] = [];
  const seen = new Set<string>();
  for (const entry of emails) {
    let address = "";
    let label: "personal" | "work" | "other" = "other";
    if (typeof entry === "string") {
      address = entry.trim();
    } else if (entry != null && typeof entry === "object") {
      const record = entry as { address?: unknown; email?: unknown; label?: unknown };
      address = String(record.address ?? record.email ?? "").trim();
      const rawLabel = String(record.label ?? "")
        .trim()
        .toLowerCase();
      if (
        rawLabel === "personal" ||
        rawLabel === "work" ||
        rawLabel === "other"
      ) {
        label = rawLabel;
      }
    }
    if (!address) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, address });
  }
  return out.slice(0, 20);
}

function asCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export type ContactsPageProps = {
  organizationRouteParam?: string;
  organizationName?: string;
};

export function ContactsPage({
  organizationRouteParam,
  organizationName,
}: ContactsPageProps = {}) {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const keepAliveActive = useKeepAliveActive();
  const location = useShellLocation();
  const { slug, contactSlug: contactSlugParam, section: sectionParam } =
    useShellParams() as {
      slug?: string;
      contactSlug?: string;
      section?: string;
    };
  const routedSlug = contactSlugParam ?? slug;
  const routeScope = useMemo<ContactRouteScope>(
    () =>
      organizationRouteParam
        ? { kind: "organization", organizationRouteParam }
        : { kind: "standalone" },
    [organizationRouteParam],
  );
  const contactsListHref = getScopedContactsListHref(routeScope);
  const workspace = useDesktopWorkspaceData();
  const keepAliveFrozen = useKeepAliveFrozen();
  const { client } = useDesktopApi();
  const [avatarOverride, setAvatarOverride] = useState<
    string | null | undefined
  >(undefined);
  const [mapboxConfigured, setMapboxConfigured] = useState(false);
  const [mapImageSrc, setMapImageSrc] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapHint, setMapHint] = useState<string | null>(null);
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  const contacts = workspace.contacts;
  const { organizations, allTasks: tasks, letters } = workspace;
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    keepAliveFrozen ? [] : organizations,
  );

  const isStandalone = routeScope.kind === "standalone";
  const selectedGroupId = parseCrmGroupId(location.searchStr ?? "");
  const groupsCatalog = useCrmGroupsCatalog(isStandalone && keepAliveActive);
  const groupMembers = useCrmGroupContactIds(
    selectedGroupId,
    isStandalone && keepAliveActive && Boolean(selectedGroupId),
  );
  const selectedGroupName = selectedGroupId
    ? (groupsCatalog.groups.find((group) => group.id === selectedGroupId)
        ?.name ?? null)
    : null;
  const selected = routedSlug
    ? (contacts.find((contact) => contactMatchesSlug(contact, routedSlug)) ??
      null)
    : null;
  const [detailCollapsed, setDetailCollapsed] = useState(false);

  const details = selected
    ? (workspace.contactDetails[selected.id] ?? null)
    : null;

  const contactLatitude = asCoord(details?.latitude);
  const contactLongitude = asCoord(details?.longitude);

  useEffect(() => {
    if (!keepAliveActive) return;
    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<MapboxSettings>(
          "/api/v1/settings/mapbox",
        );
        if (!cancelled) setMapboxConfigured(body.accessTokenConfigured);
      } catch {
        if (!cancelled) setMapboxConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, keepAliveActive]);

  useEffect(() => {
    setGeocodeFailed(false);
  }, [selected?.id]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    if (
      contactLatitude == null ||
      contactLongitude == null ||
      !mapboxConfigured
    ) {
      setMapImageSrc((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setMapLoading(false);
      return;
    }

    setMapLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          lat: String(contactLatitude),
          lng: String(contactLongitude),
          width: "640",
          height: "320",
        });
        const blob = await client.requestBinary(
          `/api/v1/mapbox/static-map?${params}`,
        );
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setMapImageSrc((current) => {
          if (current) URL.revokeObjectURL(current);
          return objectUrl;
        });
        setMapHint(null);
      } catch {
        if (cancelled) return;
        setMapImageSrc((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
        setMapHint("Couldn’t load the map image.");
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, contactLatitude, contactLongitude, mapboxConfigured]);

  useEffect(() => {
    const addressLine = formatContactAddressLine({
      address: details?.address ?? null,
      city: details?.city ?? null,
      postalCode: details?.postalCode ?? null,
      region: details?.region ?? null,
      country: details?.country ?? null,
    });
    if (contactLatitude != null && contactLongitude != null) {
      setMapHint(null);
      return;
    }
    if (!addressLine) {
      setMapHint(null);
      return;
    }
    if (!mapboxConfigured) {
      setMapHint("Add a Mapbox token in Settings → Mapbox to show this on a map.");
      return;
    }
    if (geocodeFailed) {
      setMapHint("Couldn’t locate this address.");
      return;
    }
    setMapHint(null);
  }, [
    contactLatitude,
    contactLongitude,
    details?.address,
    details?.city,
    details?.country,
    details?.region,
    details?.postalCode,
    geocodeFailed,
    mapboxConfigured,
  ]);

  const resolveContactLocation = useCallback(
    async (contactId: string, parts: ContactLocationParts) => {
      const addressLine = formatContactAddressLine(parts);
      if (!addressLine) {
        setGeocodeFailed(false);
        await workspace.patchContact(contactId, {
          latitude: null,
          longitude: null,
        });
        return;
      }
      if (!mapboxConfigured) {
        setGeocodeFailed(false);
        return;
      }
      try {
        const params = new URLSearchParams({ q: addressLine });
        const countryCode = resolveCountryOption(parts.country)?.code;
        if (countryCode) {
          params.set("country", countryCode);
        }
        const body = await client.requestJson<{
          result: MapboxGeocodeResult | null;
        }>(`/api/v1/mapbox/geocode?${params}`);
        if (!body.result) {
          setGeocodeFailed(true);
          await workspace.patchContact(contactId, {
            latitude: null,
            longitude: null,
          });
          return;
        }
        setGeocodeFailed(false);
        await workspace.patchContact(contactId, {
          latitude: body.result.latitude,
          longitude: body.result.longitude,
        });
      } catch {
        setGeocodeFailed(true);
      }
    },
    [client, mapboxConfigured, workspace],
  );

  const activeSection = parseContactSectionId(sectionParam);
  const activityFeed = useCrmActivityFeed(
    "contact",
    selected?.id ?? null,
    keepAliveActive && Boolean(selected) && activeSection === "overview",
  );
  const relationships = useContactRelationships(
    selected?.id ?? null,
    keepAliveActive && Boolean(selected) && activeSection === "details",
  );
  const crmGroups = useCrmGroupsForSubject(
    "contact",
    selected?.id ?? null,
    keepAliveActive && Boolean(selected),
  );
  const groupOptions = useMemo(
    () =>
      crmGroups.allGroups.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
      })),
    [crmGroups.allGroups],
  );
  const memberGroupIds = useMemo(
    () => crmGroups.memberGroups.map((group) => group.id),
    [crmGroups.memberGroups],
  );
  const handleMemberGroupIdsChange = useCallback(
    (nextIds: string[]) => {
      const previous = new Set(memberGroupIds);
      const next = new Set(nextIds);
      for (const groupId of next) {
        if (!previous.has(groupId)) {
          void crmGroups.toggleMembership(groupId, true);
        }
      }
      for (const groupId of previous) {
        if (!next.has(groupId)) {
          void crmGroups.toggleMembership(groupId, false);
        }
      }
    },
    [crmGroups.toggleMembership, memberGroupIds],
  );
  const sectionLabel =
    activeSection === "overview"
      ? null
      : (CONTACT_SECTIONS.find((entry) => entry.id === activeSection)?.label ??
        null);

  const selectedSlugValue = selected ? String(contactSlug(selected)) : null;

  useEffect(() => {
    setAvatarOverride(undefined);
  }, [selected?.id]);

  useEffect(() => {
    setDetailCollapsed(false);
  }, [selected?.id]);

  // Invalid section segment → overview (standalone overlay / org detail).
  // Legacy `/activity` and `/relationships` → `/details`.
  useEffect(() => {
    if (!keepAliveActive) return;
    if (!selected || !sectionParam || !selectedSlugValue) return;
    if (sectionParam === "activity" || sectionParam === "relationships") {
      navigate(
        getScopedContactSectionHref(selectedSlugValue, "details", routeScope),
        { replace: true },
      );
      return;
    }
    if (sectionParam === "overview" || !isContactSectionId(sectionParam)) {
      navigate(
        getScopedContactSectionHref(selectedSlugValue, "overview", routeScope),
        { replace: true },
      );
    }
  }, [
    keepAliveActive,
    navigate,
    routeScope,
    sectionParam,
    selected,
    selectedSlugValue,
  ]);

  useDesktopSectionBreadcrumb(
    selected
      ? organizationRouteParam && organizationName
        ? [
            { label: "Organizations", href: "/organizations" },
            {
              label: organizationName,
              href: getOrganizationSectionHref(
                organizationRouteParam,
                "overview",
              ),
            },
            {
              label: "Contacts",
              href: getOrganizationSectionHref(
                organizationRouteParam,
                "contacts",
              ),
            },
            {
              label: selected.name,
              href:
                activeSection === "overview" || !selectedSlugValue
                  ? undefined
                  : getScopedContactSectionHref(
                      selectedSlugValue,
                      "overview",
                      routeScope,
                    ),
            },
            ...(sectionLabel ? [{ label: sectionLabel }] : []),
          ]
        : [
            {
              label: "Contacts",
              href: getContactsGroupHref(selectedGroupId),
            },
            {
              label: selected.name,
              href:
                activeSection === "overview" || !selectedSlugValue
                  ? undefined
                  : getContactOverlayHref(selectedSlugValue, {
                      groupId: selectedGroupId,
                    }),
            },
            ...(sectionLabel ? [{ label: sectionLabel }] : []),
          ]
      : [
          {
            label: selectedGroupName ?? "Contacts",
          },
        ],
    { enabled: keepAliveActive },
  );

  const organizationOptions = useMemo(
    () =>
      organizations.map((org) => ({
        id: org.id,
        name: org.name,
        number: org.number,
        key: org.key,
        avatarSrc: organizationAvatarSrc[org.id] ?? null,
      })),
    [organizationAvatarSrc, organizations],
  );

  const overviewContacts = useMemo((): ContactListItem[] => {
    const mapped = contacts.map((contact) => ({
      ...contact,
      avatarSrc: contactAvatarSrc[contact.id] ?? contact.avatarSrc ?? null,
    }));
    if (!selectedGroupId) return mapped;
    return mapped.filter((contact) => groupMembers.contactIds.has(contact.id));
  }, [contactAvatarSrc, contacts, groupMembers.contactIds, selectedGroupId]);

  const handleDeleteContact = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Contact is required." };
    }
    try {
      await workspace.softDeleteContact(selected.id);
      navigate(
        isStandalone
          ? getContactsGroupHref(selectedGroupId)
          : contactsListHref,
        { replace: true },
      );
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete contact.",
      };
    }
  }, [
    contactsListHref,
    isStandalone,
    navigate,
    selected,
    selectedGroupId,
    workspace,
  ]);

  const contactLetters = useMemo(() => {
    if (!selected) return [];
    return letters.filter((letter) => {
      if (letter.contactId === selected.id) return true;
      const record = workspace.letterRecords[letter.id];
      return record?.contactId === selected.id;
    });
  }, [letters, selected, workspace.letterRecords]);

  const activityTimelineItems = useMemo(() => {
    if (!selected) return activityFeed.items;
    const contactId = selected.id;
    const fromFeed = activityFeed.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      occurredAt: item.occurredAt,
      body: item.body,
      bodyPreview: item.bodyPreview,
      meetingId: item.meetingId,
      meetingTitle: item.meetingTitle,
    }));
    // Same scoping as ContactTasksListView: assignee or linked contact.
    const completedTasks = tasks
      .filter((task) => {
        if (isHabitLinkedTask(task)) return false;
        const linked =
          task.assigneeId === contactId || task.contactId === contactId;
        if (!linked) return false;
        return migrateLegacyTaskStatus(task.status) === "completed";
      })
      .map((task) => {
        const occurredAt =
          typeof task.updatedAt === "number"
            ? new Date(task.updatedAt).toISOString()
            : new Date().toISOString();
        return {
          id: `task:${task.id}`,
          kind: "task" as const,
          occurredAt,
          taskId: task.id,
          taskTitle: task.title,
        };
      });
    const letterItems = contactLetters
      .map((letter) => {
        const record = workspace.letterRecords[letter.id];
        const receivedAt = record?.receivedDate ?? null;
        const createdAt = record?.createdAt ?? null;
        const dueMs =
          typeof letter.dueDate === "number"
            ? letter.dueDate
            : letter.dueDate instanceof Date
              ? letter.dueDate.getTime()
              : null;
        const occurredAt =
          receivedAt ??
          createdAt ??
          (dueMs != null ? new Date(dueMs).toISOString() : null);
        if (!occurredAt) return null;
        return {
          id: `letter:${letter.id}`,
          kind: "letter" as const,
          occurredAt,
          letterId: letter.id,
          letterTitle: letter.title,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null);

    return [...fromFeed, ...completedTasks, ...letterItems].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    );
  }, [
    activityFeed.items,
    contactLetters,
    selected,
    tasks,
    workspace.letterRecords,
  ]);

  const openContact = useCallback(
    (contact: ContactListItem) => {
      const routeParam = getUniqueListItemRouteParam(contact, contacts);
      if (isStandalone) {
        navigate(
          getContactOverlayHref(routeParam, {
            groupId: selectedGroupId,
          }),
        );
        return;
      }
      navigate(getScopedContactSectionHref(routeParam, "overview", routeScope));
    },
    [contacts, isStandalone, navigate, routeScope, selectedGroupId],
  );

  const closeOverlay = useCallback(() => {
    setDetailCollapsed(false);
    navigate(getContactsGroupHref(selectedGroupId), { replace: true });
  }, [navigate, selectedGroupId]);

  const hideDetail = useCallback(() => {
    setDetailCollapsed(true);
  }, []);

  const showDetail = useCallback(() => {
    setDetailCollapsed(false);
  }, []);

  useEffect(() => {
    if (!keepAliveActive || !isStandalone || !selected) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!shouldHandleGlobalShortcut(event)) return;
        event.preventDefault();
        event.stopPropagation();
        closeOverlay();
        return;
      }
      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setDetailCollapsed((current) => !current);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeOverlay, isStandalone, keepAliveActive, selected]);

  function handleSectionChange(next: ContactSectionId) {
    if (!selectedSlugValue) return;
    if (isStandalone) {
      navigate(
        getContactOverlayHref(selectedSlugValue, {
          section: next === "overview" ? undefined : next,
          groupId: selectedGroupId,
        }),
        { replace: true },
      );
      return;
    }
    navigate(getScopedContactSectionHref(selectedSlugValue, next, routeScope), {
      replace: true,
    });
  }

  function renderSection(sectionId: ContactSectionId) {
    if (!selected || !selectedSlugValue) return null;
    const contact = selected;
    const contactRouteSlug = selectedSlugValue;

    if (sectionId === "tasks") {
      return (
        <ContactTasksListView
          contactId={contact.id}
          tasks={tasks}
          onSelectTask={(taskId) => {
            const task = tasks.find((entry) => entry.id === taskId);
            if (!task) {
              navigate(`/tasks/${taskId}`);
              return;
            }
            const contactKey =
              contact.key ??
              (contact.number != null ? `C-${contact.number}` : null);
            navigate(
              buildSourceTaskTrailHref(
                getScopedContactBasePath(contactRouteSlug, routeScope),
                {
                  id: task.id,
                  number: task.number,
                  projectKey: task.projectKey,
                  contactKey,
                },
              ),
            );
          }}
          onStatusChange={(taskId, status: TaskStatus) => {
            void workspace.patchTask(taskId, { status });
          }}
          onPriorityChange={(taskId, priority) => {
            void workspace.patchTask(taskId, { priority });
          }}
          onDueDateChange={(taskId, dueDate) => {
            void workspace.patchTask(taskId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onBulkDelete={async (taskIds) => {
            for (const taskId of taskIds) {
              await workspace.softDeleteTask(taskId);
            }
          }}
          onReorder={(request) => {
            const patches = taskReorderPatches(tasks, request);
            for (const patch of patches) {
              void workspace.patchTask(patch.id, {
                status: patch.status,
                sortOrder: patch.sortOrder,
              });
            }
          }}
        />
      );
    }

    if (sectionId === "letters") {
      return (
        <ScopedLettersListView
          letters={contactLetters}
          onSelectLetter={(letter) =>
            navigate(
              getScopedContactLetterHref(
                contactRouteSlug,
                letter.number,
                routeScope,
              ),
            )
          }
          onStatusChange={(letterId, status: TaskStatus) => {
            void workspace.patchLetter(letterId, { status });
          }}
          onDueDateChange={(letterId, dueDate) => {
            void workspace.patchLetter(letterId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onCompose={(status) => {
            const params = new URLSearchParams({
              contactId: contact.id,
              status,
            });
            if (contact.organizationId) {
              params.set("organizationId", contact.organizationId);
            }
            navigate(
              `${getScopedContactLetterHref(contactRouteSlug, "new", routeScope)}?${params.toString()}`,
            );
          }}
        />
      );
    }

    return null;
  }

  function renderContactDetail() {
    if (!selected || !selectedSlugValue) return null;
    const contact = selected;
    const syncedAvatarSrc = contactAvatarSrc[contact.id] ?? null;
    const avatarSrc =
      avatarOverride !== undefined ? avatarOverride : syncedAvatarSrc;

    return (
      <ContactDetailView
        contact={{
          id: contact.id,
          name: contact.name,
          firstName: contact.firstName ?? null,
          lastName: contact.lastName ?? null,
          displayId:
            contact.number != null ? `C-${contact.number}` : contact.key,
          email: details?.email ?? null,
          emails: normalizeContactEmails(details?.emails ?? selected.emails),
          phone: details?.phone ?? null,
          title: details?.title ?? null,
          address: details?.address ?? null,
          city: details?.city ?? null,
          postalCode: details?.postalCode ?? null,
          country: details?.country ?? null,
          region: details?.region ?? null,
          latitude: contactLatitude,
          longitude: contactLongitude,
          organizationId: contact.organizationId ?? details?.organizationId,
          organizationName: contact.organizationName,
          summary: details?.summary ?? null,
          socialAccounts: normalizeContactSocialAccounts(
            details?.socialAccounts,
          ),
          birthday: details?.birthday ?? selected.birthday ?? null,
        }}
        organizationOptions={organizationOptions}
        groupOptions={groupOptions}
        memberGroupIds={memberGroupIds}
        onMemberGroupIdsChange={handleMemberGroupIdsChange}
        section={activeSection}
        onSectionChange={handleSectionChange}
        renderSection={renderSection}
        relationshipsSlot={
          <ContactRelationshipsListView
            items={relationships.items}
            loading={relationships.loading}
            error={relationships.error}
            contactOptions={contacts
              .filter((entry) => entry.id !== contact.id)
              .map((entry) => ({ id: entry.id, name: entry.name }))}
            onSelectContact={(contactId) => {
              const target = contacts.find((entry) => entry.id === contactId);
              if (!target) return;
              openContact(target);
            }}
            onAdd={relationships.add}
            onRemove={relationships.remove}
          />
        }
        activitySlot={
          <CrmActivityFeedView
            items={activityTimelineItems}
            loading={activityFeed.loading}
            error={activityFeed.error}
            nextCursor={activityFeed.nextCursor}
            onLoadMore={activityFeed.loadMore}
            onSubmitNote={activityFeed.submitNote}
            onOpenMeeting={(meetingId) =>
              navigate(`/calendar/meetings/${encodeURIComponent(meetingId)}`)
            }
            onOpenTask={(taskId) => {
              const task = tasks.find((entry) => entry.id === taskId);
              if (!task) {
                navigate(`/tasks/${taskId}`);
                return;
              }
              const contactKey =
                contact.key ??
                (contact.number != null ? `C-${contact.number}` : null);
              navigate(
                buildSourceTaskTrailHref(
                  getScopedContactBasePath(selectedSlugValue, routeScope),
                  {
                    id: task.id,
                    number: task.number,
                    projectKey: task.projectKey,
                    contactKey,
                  },
                ),
              );
            }}
            onOpenLetter={(letterId) => {
              const letter = contactLetters.find(
                (entry) => entry.id === letterId,
              );
              if (!letter) return;
              navigate(
                getScopedContactLetterHref(
                  selectedSlugValue,
                  letter.number,
                  routeScope,
                ),
              );
            }}
          />
        }
        onCreateOrganizationFromQuery={(query) => {
          void workspace.createOrganization({ name: query }).then((created) => {
            void workspace.patchContact(contact.id, {
              organizationId: created.id,
              organizationName: query.trim(),
            });
          });
        }}
        overviewHeaderAccessory={
          <AvatarUpload
            displayName={contact.name}
            avatarSrc={avatarSrc}
            showHint={false}
            onUpload={async (file) => {
              const result = await uploadDesktopAvatar(
                client,
                "contact",
                contact.id,
                file,
              );
              if (result.ok) {
                const url = URL.createObjectURL(file);
                setAvatarOverride((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return url;
                });
              }
              return result;
            }}
            onRemove={async () => {
              const result = await removeDesktopAvatar(
                client,
                "contact",
                contact.id,
              );
              if (result.ok) {
                setAvatarOverride((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return null;
                });
              }
              return result;
            }}
          />
        }
        onSaveFirstName={(firstName) => {
          void workspace.patchContact(contact.id, { firstName });
          return { ok: true };
        }}
        onSaveLastName={(lastName) => {
          void workspace.patchContact(contact.id, { lastName });
          return { ok: true };
        }}
        onSaveDetails={(patch: ContactOverviewDetails) => {
          void workspace.patchContact(contact.id, patch);
        }}
        onAfterLocationSave={(parts) => {
          void resolveContactLocation(contact.id, parts);
        }}
        mapImageSrc={mapImageSrc}
        mapLoading={mapLoading}
        mapHint={mapHint}
        onAddTask={() => {
          requestOpenComposeModal();
        }}
        onAddMeeting={() => {
          const start = new Date();
          start.setMinutes(0, 0, 0);
          start.setHours(start.getHours() + 1);
          const end = new Date(start.getTime() + 30 * 60 * 1000);
          void workspace
            .createMeeting({
              title: `Meeting with ${contact.name}`,
              status: "triage",
              startAt: start.toISOString(),
              endAt: end.toISOString(),
            })
            .then((created) => {
              navigate(`/calendar/meetings/${encodeURIComponent(created.id)}`);
            });
        }}
        onSendEmail={() => {
          const to =
            getContactEmailAddresses({
              email: details?.email ?? contact.email,
              emails: normalizeContactEmails(
                details?.emails ?? contact.emails,
              ),
            })[0] || undefined;
          resetEmailComposeSession();
          writeEmailComposeSession({
            sessionId: crypto.randomUUID(),
            draftId: null,
            inboxId: null,
            prefill: to ? { to } : null,
          });
          navigate(getEmailComposeHref());
        }}
      />
    );
  }

  // Org-scoped: keep full-page detail (org list stays in left panel).
  if (!isStandalone) {
    if (!routedSlug) {
      return (
        <EntityDetailLayout
          sectionLabel="Contacts"
          title={null}
          resolving={contacts.length > 0}
        />
      );
    }
    if (!selected || !selectedSlugValue) {
      return (
        <EntityDetailLayout
          sectionLabel="Contacts"
          title={null}
          emptyMessage="Contact not found."
        />
      );
    }
    return (
      <>
        {keepAliveActive ? (
          <>
            <RegisterPageTitle title={selected.name} />
            {activeSection === "overview" ? (
              <RegisterEntityDeleteAction
                entityLabel={`contact "${selected.name}"`}
                onDelete={handleDeleteContact}
              />
            ) : null}
          </>
        ) : null}
        {renderContactDetail()}
      </>
    );
  }

  // Standalone: list + resizable right detail rail (hide/show with ]).
  if (routedSlug && !selected) {
    return (
      <div
        className="contacts-page journal-day-layout desktop-journal-day-layout"
        data-content-detail
        data-detail-split
      >
        <div className="journal-day-layout__main">
          <ContactsOverviewView
            contacts={overviewContacts}
            emptyMessage={
              selectedGroupId
                ? "No contacts in this group yet."
                : "No contacts yet."
            }
            onSelect={(contact) => openContact(contact)}
            onAdd={() => {
              void workspace
                .createContact({ firstName: "New", lastName: "contact" })
                .then((created) => {
                  const match = contacts.find(
                    (entry) => entry.id === created.id,
                  );
                  if (match) openContact(match);
                  else
                    navigate(
                      getContactOverlayHref(created.key, {
                        groupId: selectedGroupId,
                      }),
                    );
                });
            }}
          />
        </div>
        <EntityDetailLayout
          sectionLabel="Contacts"
          title={null}
          emptyMessage="Contact not found."
        />
      </div>
    );
  }

  return (
    <div
      className={[
        "contacts-page",
        "journal-day-layout",
        "desktop-journal-day-layout",
        selected && detailCollapsed ? "is-calendar-collapsed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-detail
      data-detail-split
      data-calendar-collapsed={
        selected && detailCollapsed ? "true" : "false"
      }
    >
      {keepAliveActive && selected ? (
        <>
          <RegisterPageTitle title={selected.name} />
          {activeSection === "overview" ? (
            <RegisterEntityDeleteAction
              entityLabel={`contact "${selected.name}"`}
              onDelete={handleDeleteContact}
            />
          ) : null}
        </>
      ) : keepAliveActive ? (
        <RegisterPageTitle title="Contacts" />
      ) : null}

      <div className="journal-day-layout__main">
        <ContactsOverviewView
          contacts={overviewContacts}
          emptyMessage={
            selectedGroupId
              ? "No contacts in this group yet."
              : "No contacts yet."
          }
          selectedId={selected?.id ?? null}
          onSelect={(contact) => openContact(contact)}
          onAdd={() => {
            void workspace
              .createContact({ firstName: "New", lastName: "contact" })
              .then((created) => {
                const match =
                  contacts.find((entry) => entry.id === created.id) ??
                  overviewContacts.find((entry) => entry.id === created.id);
                if (match) openContact(match);
                else
                  navigate(
                    getContactOverlayHref(created.key, {
                      groupId: selectedGroupId,
                    }),
                  );
              });
          }}
        />
      </div>

      <ContactDetailOverlay
        open={Boolean(selected)}
        collapsed={detailCollapsed}
        title={selected?.name ?? "Contact"}
        onClose={closeOverlay}
        onHide={hideDetail}
        onShow={showDetail}
      >
        {renderContactDetail()}
      </ContactDetailOverlay>
    </div>
  );
}
