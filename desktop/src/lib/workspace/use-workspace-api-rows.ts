import { useEffect, useRef, useState } from "react";
import type {
  Area as ApiArea,
  Contact as ApiContact,
  Document as ApiDocument,
  Letter as ApiLetter,
  Organization as ApiOrganization,
  Project as ApiProject,
  Habit as ApiHabit,
  Meeting as ApiMeeting,
  Task as ApiTask,
} from "@backsteros/contracts";
import { ApiClientError, type BacksterosApiClient } from "@backsteros/api-client";

import { createRequestAbortSignal } from "../request-timeout";
import {
  preferNewerByUpdatedAt,
  preservePendingApiRows,
} from "../merge-local-and-api";
import {
  WORKSPACE_AREA_UPDATED_EVENT,
  WORKSPACE_CONTACT_UPDATED_EVENT,
  WORKSPACE_DOCUMENT_UPDATED_EVENT,
  WORKSPACE_HABIT_UPDATED_EVENT,
  WORKSPACE_LETTER_UPDATED_EVENT,
  WORKSPACE_MEETING_UPDATED_EVENT,
  WORKSPACE_ORGANIZATION_UPDATED_EVENT,
  WORKSPACE_PROJECT_UPDATED_EVENT,
  WORKSPACE_TASK_UPDATED_EVENT,
  type WorkspaceAreaUpdatedDetail,
  type WorkspaceContactUpdatedDetail,
  type WorkspaceDocumentUpdatedDetail,
  type WorkspaceHabitUpdatedDetail,
  type WorkspaceLetterUpdatedDetail,
  type WorkspaceMeetingUpdatedDetail,
  type WorkspaceOrganizationUpdatedDetail,
  type WorkspaceProjectUpdatedDetail,
  type WorkspaceTaskUpdatedDetail,
} from "../workspace-events";
import {
  shouldDesktopRestHydrateColdStart,
  shouldDesktopSkipRestHydrateAfterSync,
} from "./rest-list-hydration-policy";
import type { WorkspacePowerSync } from "./workspace-data-types";

/** Coalesce bursty agent reorder/move SSE into one metadata fetch. */
const DOCUMENT_LIVE_FETCH_DEBOUNCE_MS = 100;
const PROJECT_LIVE_FETCH_DEBOUNCE_MS = 100;
const MEETING_LIVE_FETCH_DEBOUNCE_MS = 100;
const CONTACT_LIVE_FETCH_DEBOUNCE_MS = 100;
const ORGANIZATION_LIVE_FETCH_DEBOUNCE_MS = 100;
const AREA_LIVE_FETCH_DEBOUNCE_MS = 100;
const HABIT_LIVE_FETCH_DEBOUNCE_MS = 100;
const LETTER_LIVE_FETCH_DEBOUNCE_MS = 100;
const TASK_LIVE_FETCH_DEBOUNCE_MS = 100;

/**
 * REST-hydrated row caches for cold-start rescue + readiness, plus sparse
 * SSE live overlays for documents/projects (agent/CLI before PowerSync).
 *
 * Linear-shaped: hydrate only when disconnected or SQLite has no rows yet
 * ({@link shouldDesktopRestHydrateColdStart}). Skip after a completed sync
 * download. Overlays are id-scoped only.
 */
export function useWorkspaceApiRows({
  authenticated,
  client,
  powerSync,
  hasLocalRows,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
  /** True once any Tier A/B list watch has returned rows. */
  hasLocalRows: boolean;
}) {
  const [apiTasks, setApiTasks] = useState<ApiTask[] | null>(null);
  const [apiInboxTasks, setApiInboxTasks] = useState<ApiTask[] | null>(null);
  const [apiProjects, setApiProjects] = useState<ApiProject[] | null>(null);
  const [apiLetters, setApiLetters] = useState<ApiLetter[] | null>(null);
  const [apiContacts, setApiContacts] = useState<ApiContact[] | null>(null);
  const [apiOrganizations, setApiOrganizations] = useState<
    ApiOrganization[] | null
  >(null);
  const [apiAreas, setApiAreas] = useState<ApiArea[] | null>(null);
  const [apiDocuments, setApiDocuments] = useState<ApiDocument[] | null>(null);
  /** SSE agent document rows — not the cold-start hydrate array. */
  const [liveDocumentsById, setLiveDocumentsById] = useState(
    () => new Map<string, ApiDocument>(),
  );
  const [liveDeletedDocumentIds, setLiveDeletedDocumentIds] = useState(
    () => new Set<string>(),
  );
  /** SSE CLI/agent project rows. */
  const [liveProjectsById, setLiveProjectsById] = useState(
    () => new Map<string, ApiProject>(),
  );
  const [liveDeletedProjectIds, setLiveDeletedProjectIds] = useState(
    () => new Set<string>(),
  );
  /** SSE agent/CLI meeting rows (calendar before PowerSync). */
  const [liveMeetingsById, setLiveMeetingsById] = useState(
    () => new Map<string, ApiMeeting>(),
  );
  const [liveDeletedMeetingIds, setLiveDeletedMeetingIds] = useState(
    () => new Set<string>(),
  );
  /** SSE contact rows (portal / peer writes before PowerSync). */
  const [liveContactsById, setLiveContactsById] = useState(
    () => new Map<string, ApiContact>(),
  );
  const [liveDeletedContactIds, setLiveDeletedContactIds] = useState(
    () => new Set<string>(),
  );
  /** SSE organization rows (portal / peer writes before PowerSync). */
  const [liveOrganizationsById, setLiveOrganizationsById] = useState(
    () => new Map<string, ApiOrganization>(),
  );
  const [liveDeletedOrganizationIds, setLiveDeletedOrganizationIds] = useState(
    () => new Set<string>(),
  );
  /** SSE area rows (agent / peer writes before PowerSync). */
  const [liveAreasById, setLiveAreasById] = useState(
    () => new Map<string, ApiArea>(),
  );
  const [liveDeletedAreaIds, setLiveDeletedAreaIds] = useState(
    () => new Set<string>(),
  );
  /** SSE habit rows (agent / peer writes before PowerSync). */
  const [liveHabitsById, setLiveHabitsById] = useState(
    () => new Map<string, ApiHabit>(),
  );
  const [liveDeletedHabitIds, setLiveDeletedHabitIds] = useState(
    () => new Set<string>(),
  );
  /** SSE letter rows (agent / peer writes before PowerSync). */
  const [liveLettersById, setLiveLettersById] = useState(
    () => new Map<string, ApiLetter>(),
  );
  const [liveDeletedLetterIds, setLiveDeletedLetterIds] = useState(
    () => new Set<string>(),
  );
  /** SSE task rows (portal / agent / peer writes before PowerSync). */
  const [liveTasksById, setLiveTasksById] = useState(
    () => new Map<string, ApiTask>(),
  );
  const [liveDeletedTaskIds, setLiveDeletedTaskIds] = useState(
    () => new Set<string>(),
  );
  const [apiHabits, setApiHabits] = useState<ApiHabit[] | null>(null);
  const [apiMeetings, setApiMeetings] = useState<ApiMeeting[] | null>(null);
  const [restHydrateSettled, setRestHydrateSettled] = useState(!authenticated);
  const [queriesGracePeriodExpired, setQueriesGracePeriodExpired] =
    useState(false);

  useEffect(() => {
    if (!authenticated) {
      setRestHydrateSettled(true);
      return;
    }
    setRestHydrateSettled(false);
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || !powerSync.ready) {
      setQueriesGracePeriodExpired(false);
      return;
    }
    const timeoutId = window.setTimeout(
      () => setQueriesGracePeriodExpired(true),
      5_000,
    );
    return () => window.clearTimeout(timeoutId);
  }, [authenticated, powerSync.ready]);

  useEffect(() => {
    if (!authenticated) {
      setApiTasks(null);
      setApiInboxTasks(null);
      setApiProjects(null);
      setApiLetters(null);
      setApiContacts(null);
      setApiOrganizations(null);
      setApiAreas(null);
      setApiDocuments(null);
      setLiveDocumentsById(new Map());
      setLiveDeletedDocumentIds(new Set());
      setLiveProjectsById(new Map());
      setLiveDeletedProjectIds(new Set());
      setLiveMeetingsById(new Map());
      setLiveDeletedMeetingIds(new Set());
      setLiveContactsById(new Map());
      setLiveDeletedContactIds(new Set());
      setLiveOrganizationsById(new Map());
      setLiveDeletedOrganizationIds(new Set());
      setLiveAreasById(new Map());
      setLiveDeletedAreaIds(new Set());
      setLiveHabitsById(new Map());
      setLiveDeletedHabitIds(new Set());
      setLiveLettersById(new Map());
      setLiveDeletedLetterIds(new Set());
      setApiHabits(null);
      setApiMeetings(null);
    }
  }, [authenticated]);

  const hasHydratedOnceRef = useRef(false);

  // Cold-start REST rescue only (Linear-shaped: once SQLite/PowerSync has rows,
  // lists stay local — no soft-revalidate merge against wall-clock API).
  // Packaged desktop can be "ready" with empty SQLite if the sync stream never
  // connects; wave 1/2 hydrate fills that gap once per auth session.
  useEffect(() => {
    if (!authenticated) {
      hasHydratedOnceRef.current = false;
      return;
    }

    let cancelled = false;
    let wave2IdleId: number | null = null;
    let wave2TimeoutId: number | null = null;
    const signal = createRequestAbortSignal();

    const markWave1Hydrated = () => {
      setApiTasks((current) => current ?? []);
      setApiInboxTasks((current) => current ?? []);
      setApiProjects((current) => current ?? []);
    };

    const markWave2Hydrated = () => {
      setApiDocuments((current) => current ?? []);
      setApiAreas((current) => current ?? []);
      setApiOrganizations((current) => current ?? []);
      setApiContacts((current) => current ?? []);
      setApiLetters((current) => current ?? []);
      setApiHabits((current) => current ?? []);
      setApiMeetings((current) => current ?? []);
    };

    const runWave2 = async () => {
      try {
        const [
          documentsBody,
          areasBody,
          orgsBody,
          contactsBody,
          lettersBody,
        ] = await Promise.all([
          client.requestJson<{ documents: ApiDocument[] }>(
            "/api/v1/documents",
            { signal },
          ),
          client.requestJson<{ areas: ApiArea[] }>("/api/v1/areas", { signal }),
          client.requestJson<{ organizations: ApiOrganization[] }>(
            "/api/v1/organizations",
            { signal },
          ),
          client.requestJson<{ contacts: ApiContact[] }>("/api/v1/contacts", {
            signal,
          }),
          client.requestJson<{ letters: ApiLetter[] }>("/api/v1/letters", {
            signal,
          }),
        ]);
        if (cancelled) return;
        setApiDocuments(documentsBody.documents);
        setApiAreas(areasBody.areas);
        setApiOrganizations(orgsBody.organizations);
        setApiContacts(contactsBody.contacts);
        setApiLetters((current) =>
          preservePendingApiRows(current, lettersBody.letters),
        );
      } catch {
        if (cancelled) return;
        markWave2Hydrated();
      }

      try {
        const habitsBody = await client.requestJson<{ habits: ApiHabit[] }>(
          "/api/v1/habits",
          { signal },
        );
        if (cancelled) return;
        setApiHabits(habitsBody.habits);
        const meetingsBody = await client.requestJson<{
          meetings: ApiMeeting[];
        }>("/api/v1/meetings", { signal });
        if (cancelled) return;
        setApiMeetings(meetingsBody.meetings);
        const tasksAfterHabits = await client.requestJson<{
          tasks: ApiTask[];
        }>("/api/v1/tasks", { signal });
        if (cancelled) return;
        setApiTasks(tasksAfterHabits.tasks);
      } catch {
        if (cancelled) return;
        setApiHabits((current) => current ?? []);
        setApiMeetings((current) => current ?? []);
      } finally {
        if (!cancelled) {
          markWave2Hydrated();
        }
      }
    };

    const scheduleWave2 = () => {
      const start = () => {
        if (cancelled) return;
        void runWave2();
      };
      if (typeof window.requestIdleCallback === "function") {
        wave2IdleId = window.requestIdleCallback(start, { timeout: 1_500 });
      } else {
        wave2TimeoutId = window.setTimeout(start, 0);
      }
    };

    const runHydrate = async () => {
      try {
        const [tasksBody, inboxTasksBody, projectsBody] = await Promise.all([
          client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks", { signal }),
          client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks/inbox", {
            signal,
          }),
          client.requestJson<{ projects: ApiProject[] }>("/api/v1/projects", {
            signal,
          }),
        ]);
        if (cancelled) return;
        setApiTasks(tasksBody.tasks);
        setApiInboxTasks(inboxTasksBody.tasks);
        setApiProjects(projectsBody.projects);
      } catch {
        if (cancelled) return;
        markWave1Hydrated();
      } finally {
        if (!cancelled) {
          markWave1Hydrated();
          setRestHydrateSettled(true);
          hasHydratedOnceRef.current = true;
          scheduleWave2();
        }
      }
    };

    const clearWave2Schedule = () => {
      if (wave2IdleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(wave2IdleId);
        wave2IdleId = null;
      }
      if (wave2TimeoutId != null) {
        window.clearTimeout(wave2TimeoutId);
        wave2TimeoutId = null;
      }
    };

    if (hasHydratedOnceRef.current) {
      return;
    }

    // Already bootstrapped via PowerSync — skip REST list fan-out.
    if (
      shouldDesktopSkipRestHydrateAfterSync(
        powerSync.ready,
        powerSync.lastSyncedAt,
      )
    ) {
      hasHydratedOnceRef.current = true;
      markWave1Hydrated();
      markWave2Hydrated();
      setRestHydrateSettled(true);
      return;
    }

    // Connected + SQLite already has membership — no REST rescue (mobile parity).
    if (
      powerSync.ready &&
      !shouldDesktopRestHydrateColdStart(powerSync.connected, hasLocalRows)
    ) {
      hasHydratedOnceRef.current = true;
      markWave1Hydrated();
      markWave2Hydrated();
      setRestHydrateSettled(true);
      return;
    }

    void runHydrate();
    return () => {
      cancelled = true;
      clearWave2Schedule();
    };
  }, [
    authenticated,
    client,
    hasLocalRows,
    powerSync.connected,
    powerSync.lastSyncedAt,
    powerSync.ready,
  ]);

  // Documents: workspace SSE (below) patches a sparse live overlay for agent
  // create/move/delete before PowerSync download. No full-list soft-revalidate.

  // Primary live path: agent document SSE → liveDocumentsById / deleted set.
  useEffect(() => {
    if (!authenticated) return;

    const pendingIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = () => {
      const ids = [...pendingIds];
      pendingIds.clear();
      for (const documentId of ids) {
        void client
          .requestJson<ApiDocument>(
            `/api/v1/documents/${encodeURIComponent(documentId)}`,
          )
          .then((row) => {
            if (cancelled) return;
            setLiveDeletedDocumentIds((current) => {
              if (!current.has(documentId)) return current;
              const next = new Set(current);
              next.delete(documentId);
              return next;
            });
            setLiveDocumentsById((current) => {
              const next = new Map(current);
              next.set(row.id, row);
              return next;
            });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            if (error instanceof ApiClientError && error.status === 404) {
              setLiveDeletedDocumentIds((current) => {
                if (current.has(documentId)) return current;
                const next = new Set(current);
                next.add(documentId);
                return next;
              });
              setLiveDocumentsById((current) => {
                if (!current.has(documentId)) return current;
                const next = new Map(current);
                next.delete(documentId);
                return next;
              });
            }
          });
      }
    };

    const onDocumentUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceDocumentUpdatedDetail>)
        .detail;
      if (!detail?.documentId) return;

      if (detail.operation === "delete") {
        setLiveDeletedDocumentIds((current) => {
          if (current.has(detail.documentId)) return current;
          const next = new Set(current);
          next.add(detail.documentId);
          return next;
        });
        setLiveDocumentsById((current) => {
          if (!current.has(detail.documentId)) return current;
          const next = new Map(current);
          next.delete(detail.documentId);
          return next;
        });
        return;
      }

      pendingIds.add(detail.documentId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, DOCUMENT_LIVE_FETCH_DEBOUNCE_MS);
    };

    window.addEventListener(WORKSPACE_DOCUMENT_UPDATED_EVENT, onDocumentUpdated);
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(
        WORKSPACE_DOCUMENT_UPDATED_EVENT,
        onDocumentUpdated,
      );
    };
  }, [authenticated, client]);

  // CLI/agent project SSE → sparse liveProjectsById overlay.
  // A status PATCH emits several workspace.updated events. Keep the newer
  // row (same as tasks) and skip the HTTP cache so a stale WKWebView GET
  // cannot pin the previous status until the next replication tick.
  useEffect(() => {
    if (!authenticated) return;

    const pendingIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = () => {
      const ids = [...pendingIds];
      pendingIds.clear();
      for (const projectId of ids) {
        void client
          .requestJson<ApiProject>(
            `/api/v1/projects/${encodeURIComponent(projectId)}`,
            { cache: "no-store" },
          )
          .then((row) => {
            if (cancelled) return;
            setLiveDeletedProjectIds((current) => {
              if (!current.has(projectId)) return current;
              const next = new Set(current);
              next.delete(projectId);
              return next;
            });
            setLiveProjectsById((current) => {
              const previous = current.get(row.id);
              const next = new Map(current);
              next.set(
                row.id,
                previous ? preferNewerByUpdatedAt(previous, row) : row,
              );
              return next;
            });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            if (error instanceof ApiClientError && error.status === 404) {
              setLiveDeletedProjectIds((current) => {
                if (current.has(projectId)) return current;
                const next = new Set(current);
                next.add(projectId);
                return next;
              });
              setLiveProjectsById((current) => {
                if (!current.has(projectId)) return current;
                const next = new Map(current);
                next.delete(projectId);
                return next;
              });
            }
          });
      }
    };

    const onProjectUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceProjectUpdatedDetail>)
        .detail;
      if (!detail?.projectId) return;

      if (detail.operation === "delete") {
        setLiveDeletedProjectIds((current) => {
          if (current.has(detail.projectId)) return current;
          const next = new Set(current);
          next.add(detail.projectId);
          return next;
        });
        setLiveProjectsById((current) => {
          if (!current.has(detail.projectId)) return current;
          const next = new Map(current);
          next.delete(detail.projectId);
          return next;
        });
        return;
      }

      pendingIds.add(detail.projectId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, PROJECT_LIVE_FETCH_DEBOUNCE_MS);
    };

    window.addEventListener(WORKSPACE_PROJECT_UPDATED_EVENT, onProjectUpdated);
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(
        WORKSPACE_PROJECT_UPDATED_EVENT,
        onProjectUpdated,
      );
    };
  }, [authenticated, client]);

  // Agent/CLI meeting SSE → sparse liveMeetingsById overlay for calendar.
  useEffect(() => {
    if (!authenticated) return;

    const pendingIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = () => {
      const ids = [...pendingIds];
      pendingIds.clear();
      for (const meetingId of ids) {
        void client
          .requestJson<ApiMeeting>(
            `/api/v1/meetings/${encodeURIComponent(meetingId)}`,
          )
          .then((row) => {
            if (cancelled) return;
            setLiveDeletedMeetingIds((current) => {
              if (!current.has(meetingId)) return current;
              const next = new Set(current);
              next.delete(meetingId);
              return next;
            });
            setLiveMeetingsById((current) => {
              const previous = current.get(row.id);
              const next = new Map(current);
              next.set(
                row.id,
                previous ? preferNewerByUpdatedAt(previous, row) : row,
              );
              return next;
            });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            if (error instanceof ApiClientError && error.status === 404) {
              setLiveDeletedMeetingIds((current) => {
                if (current.has(meetingId)) return current;
                const next = new Set(current);
                next.add(meetingId);
                return next;
              });
              setLiveMeetingsById((current) => {
                if (!current.has(meetingId)) return current;
                const next = new Map(current);
                next.delete(meetingId);
                return next;
              });
            }
          });
      }
    };

    const onMeetingUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceMeetingUpdatedDetail>)
        .detail;
      if (!detail?.meetingId) return;

      if (detail.operation === "delete") {
        setLiveDeletedMeetingIds((current) => {
          if (current.has(detail.meetingId)) return current;
          const next = new Set(current);
          next.add(detail.meetingId);
          return next;
        });
        setLiveMeetingsById((current) => {
          if (!current.has(detail.meetingId)) return current;
          const next = new Map(current);
          next.delete(detail.meetingId);
          return next;
        });
        return;
      }

      pendingIds.add(detail.meetingId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, MEETING_LIVE_FETCH_DEBOUNCE_MS);
    };

    window.addEventListener(WORKSPACE_MEETING_UPDATED_EVENT, onMeetingUpdated);
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(
        WORKSPACE_MEETING_UPDATED_EVENT,
        onMeetingUpdated,
      );
    };
  }, [authenticated, client]);

  // Portal / peer contact SSE → sparse liveContactsById overlay.
  useEffect(() => {
    if (!authenticated) return;

    const pendingIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = () => {
      const ids = [...pendingIds];
      pendingIds.clear();
      for (const contactId of ids) {
        void client
          .requestJson<ApiContact>(
            `/api/v1/contacts/${encodeURIComponent(contactId)}`,
          )
          .then((row) => {
            if (cancelled) return;
            setLiveDeletedContactIds((current) => {
              if (!current.has(contactId)) return current;
              const next = new Set(current);
              next.delete(contactId);
              return next;
            });
            setLiveContactsById((current) => {
              const previous = current.get(row.id);
              const next = new Map(current);
              next.set(
                row.id,
                previous ? preferNewerByUpdatedAt(previous, row) : row,
              );
              return next;
            });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            if (error instanceof ApiClientError && error.status === 404) {
              setLiveDeletedContactIds((current) => {
                if (current.has(contactId)) return current;
                const next = new Set(current);
                next.add(contactId);
                return next;
              });
              setLiveContactsById((current) => {
                if (!current.has(contactId)) return current;
                const next = new Map(current);
                next.delete(contactId);
                return next;
              });
            }
          });
      }
    };

    const onContactUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceContactUpdatedDetail>)
        .detail;
      if (!detail?.contactId) return;

      if (detail.operation === "delete") {
        setLiveDeletedContactIds((current) => {
          if (current.has(detail.contactId)) return current;
          const next = new Set(current);
          next.add(detail.contactId);
          return next;
        });
        setLiveContactsById((current) => {
          if (!current.has(detail.contactId)) return current;
          const next = new Map(current);
          next.delete(detail.contactId);
          return next;
        });
        return;
      }

      pendingIds.add(detail.contactId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, CONTACT_LIVE_FETCH_DEBOUNCE_MS);
    };

    window.addEventListener(WORKSPACE_CONTACT_UPDATED_EVENT, onContactUpdated);
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(
        WORKSPACE_CONTACT_UPDATED_EVENT,
        onContactUpdated,
      );
    };
  }, [authenticated, client]);

  // Portal / peer organization SSE → sparse liveOrganizationsById overlay.
  useEffect(() => {
    if (!authenticated) return;

    const pendingIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = () => {
      const ids = [...pendingIds];
      pendingIds.clear();
      for (const organizationId of ids) {
        void client
          .requestJson<ApiOrganization>(
            `/api/v1/organizations/${encodeURIComponent(organizationId)}`,
          )
          .then((row) => {
            if (cancelled) return;
            setLiveDeletedOrganizationIds((current) => {
              if (!current.has(organizationId)) return current;
              const next = new Set(current);
              next.delete(organizationId);
              return next;
            });
            setLiveOrganizationsById((current) => {
              const previous = current.get(row.id);
              const next = new Map(current);
              next.set(
                row.id,
                previous ? preferNewerByUpdatedAt(previous, row) : row,
              );
              return next;
            });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            if (error instanceof ApiClientError && error.status === 404) {
              setLiveDeletedOrganizationIds((current) => {
                if (current.has(organizationId)) return current;
                const next = new Set(current);
                next.add(organizationId);
                return next;
              });
              setLiveOrganizationsById((current) => {
                if (!current.has(organizationId)) return current;
                const next = new Map(current);
                next.delete(organizationId);
                return next;
              });
            }
          });
      }
    };

    const onOrganizationUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<WorkspaceOrganizationUpdatedDetail>
      ).detail;
      if (!detail?.organizationId) return;

      if (detail.operation === "delete") {
        setLiveDeletedOrganizationIds((current) => {
          if (current.has(detail.organizationId)) return current;
          const next = new Set(current);
          next.add(detail.organizationId);
          return next;
        });
        setLiveOrganizationsById((current) => {
          if (!current.has(detail.organizationId)) return current;
          const next = new Map(current);
          next.delete(detail.organizationId);
          return next;
        });
        return;
      }

      pendingIds.add(detail.organizationId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, ORGANIZATION_LIVE_FETCH_DEBOUNCE_MS);
    };

    window.addEventListener(
      WORKSPACE_ORGANIZATION_UPDATED_EVENT,
      onOrganizationUpdated,
    );
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(
        WORKSPACE_ORGANIZATION_UPDATED_EVENT,
        onOrganizationUpdated,
      );
    };
  }, [authenticated, client]);

  // Agent / peer area SSE → sparse liveAreasById overlay.
  useEffect(() => {
    if (!authenticated) return;

    const pendingIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = () => {
      const ids = [...pendingIds];
      pendingIds.clear();
      for (const areaId of ids) {
        void client
          .requestJson<ApiArea>(
            `/api/v1/areas/${encodeURIComponent(areaId)}`,
          )
          .then((row) => {
            if (cancelled) return;
            setLiveDeletedAreaIds((current) => {
              if (!current.has(areaId)) return current;
              const next = new Set(current);
              next.delete(areaId);
              return next;
            });
            setLiveAreasById((current) => {
              const previous = current.get(row.id);
              const next = new Map(current);
              next.set(
                row.id,
                previous ? preferNewerByUpdatedAt(previous, row) : row,
              );
              return next;
            });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            if (error instanceof ApiClientError && error.status === 404) {
              setLiveDeletedAreaIds((current) => {
                if (current.has(areaId)) return current;
                const next = new Set(current);
                next.add(areaId);
                return next;
              });
              setLiveAreasById((current) => {
                if (!current.has(areaId)) return current;
                const next = new Map(current);
                next.delete(areaId);
                return next;
              });
            }
          });
      }
    };

    const onAreaUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceAreaUpdatedDetail>).detail;
      if (!detail?.areaId) return;

      if (detail.operation === "delete") {
        setLiveDeletedAreaIds((current) => {
          if (current.has(detail.areaId)) return current;
          const next = new Set(current);
          next.add(detail.areaId);
          return next;
        });
        setLiveAreasById((current) => {
          if (!current.has(detail.areaId)) return current;
          const next = new Map(current);
          next.delete(detail.areaId);
          return next;
        });
        return;
      }

      pendingIds.add(detail.areaId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, AREA_LIVE_FETCH_DEBOUNCE_MS);
    };

    window.addEventListener(WORKSPACE_AREA_UPDATED_EVENT, onAreaUpdated);
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(WORKSPACE_AREA_UPDATED_EVENT, onAreaUpdated);
    };
  }, [authenticated, client]);

  // Agent / peer habit SSE → sparse liveHabitsById overlay.
  useEffect(() => {
    if (!authenticated) return;

    const pendingIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = () => {
      const ids = [...pendingIds];
      pendingIds.clear();
      for (const habitId of ids) {
        void client
          .requestJson<ApiHabit>(
            `/api/v1/habits/${encodeURIComponent(habitId)}`,
          )
          .then((row) => {
            if (cancelled) return;
            setLiveDeletedHabitIds((current) => {
              if (!current.has(habitId)) return current;
              const next = new Set(current);
              next.delete(habitId);
              return next;
            });
            setLiveHabitsById((current) => {
              const previous = current.get(row.id);
              const next = new Map(current);
              next.set(
                row.id,
                previous ? preferNewerByUpdatedAt(previous, row) : row,
              );
              return next;
            });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            if (error instanceof ApiClientError && error.status === 404) {
              setLiveDeletedHabitIds((current) => {
                if (current.has(habitId)) return current;
                const next = new Set(current);
                next.add(habitId);
                return next;
              });
              setLiveHabitsById((current) => {
                if (!current.has(habitId)) return current;
                const next = new Map(current);
                next.delete(habitId);
                return next;
              });
            }
          });
      }
    };

    const onHabitUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceHabitUpdatedDetail>).detail;
      if (!detail?.habitId) return;

      if (detail.operation === "delete") {
        setLiveDeletedHabitIds((current) => {
          if (current.has(detail.habitId)) return current;
          const next = new Set(current);
          next.add(detail.habitId);
          return next;
        });
        setLiveHabitsById((current) => {
          if (!current.has(detail.habitId)) return current;
          const next = new Map(current);
          next.delete(detail.habitId);
          return next;
        });
        return;
      }

      pendingIds.add(detail.habitId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, HABIT_LIVE_FETCH_DEBOUNCE_MS);
    };

    window.addEventListener(WORKSPACE_HABIT_UPDATED_EVENT, onHabitUpdated);
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(WORKSPACE_HABIT_UPDATED_EVENT, onHabitUpdated);
    };
  }, [authenticated, client]);

  // Agent / peer letter SSE → sparse liveLettersById overlay.
  useEffect(() => {
    if (!authenticated) return;

    const pendingIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = () => {
      const ids = [...pendingIds];
      pendingIds.clear();
      for (const letterId of ids) {
        void client
          .requestJson<ApiLetter>(
            `/api/v1/letters/${encodeURIComponent(letterId)}`,
          )
          .then((row) => {
            if (cancelled) return;
            setLiveDeletedLetterIds((current) => {
              if (!current.has(letterId)) return current;
              const next = new Set(current);
              next.delete(letterId);
              return next;
            });
            setLiveLettersById((current) => {
              const previous = current.get(row.id);
              const next = new Map(current);
              next.set(
                row.id,
                previous ? preferNewerByUpdatedAt(previous, row) : row,
              );
              return next;
            });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            if (error instanceof ApiClientError && error.status === 404) {
              setLiveDeletedLetterIds((current) => {
                if (current.has(letterId)) return current;
                const next = new Set(current);
                next.add(letterId);
                return next;
              });
              setLiveLettersById((current) => {
                if (!current.has(letterId)) return current;
                const next = new Map(current);
                next.delete(letterId);
                return next;
              });
            }
          });
      }
    };

    const onLetterUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceLetterUpdatedDetail>)
        .detail;
      if (!detail?.letterId) return;

      if (detail.operation === "delete") {
        setLiveDeletedLetterIds((current) => {
          if (current.has(detail.letterId)) return current;
          const next = new Set(current);
          next.add(detail.letterId);
          return next;
        });
        setLiveLettersById((current) => {
          if (!current.has(detail.letterId)) return current;
          const next = new Map(current);
          next.delete(detail.letterId);
          return next;
        });
        return;
      }

      pendingIds.add(detail.letterId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, LETTER_LIVE_FETCH_DEBOUNCE_MS);
    };

    window.addEventListener(WORKSPACE_LETTER_UPDATED_EVENT, onLetterUpdated);
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(
        WORKSPACE_LETTER_UPDATED_EVENT,
        onLetterUpdated,
      );
    };
  }, [authenticated, client]);

  // Portal / agent / peer task SSE → sparse liveTasksById overlay.
  useEffect(() => {
    if (!authenticated) return;

    const pendingIds = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = () => {
      const ids = [...pendingIds];
      pendingIds.clear();
      for (const taskId of ids) {
        void client
          .requestJson<ApiTask>(`/api/v1/tasks/${encodeURIComponent(taskId)}`)
          .then((row) => {
            if (cancelled) return;
            setLiveDeletedTaskIds((current) => {
              if (!current.has(taskId)) return current;
              const next = new Set(current);
              next.delete(taskId);
              return next;
            });
            setLiveTasksById((current) => {
              const previous = current.get(row.id);
              const next = new Map(current);
              next.set(
                row.id,
                previous ? preferNewerByUpdatedAt(previous, row) : row,
              );
              return next;
            });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            if (error instanceof ApiClientError && error.status === 404) {
              setLiveDeletedTaskIds((current) => {
                if (current.has(taskId)) return current;
                const next = new Set(current);
                next.add(taskId);
                return next;
              });
              setLiveTasksById((current) => {
                if (!current.has(taskId)) return current;
                const next = new Map(current);
                next.delete(taskId);
                return next;
              });
            }
          });
      }
    };

    const onTaskUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceTaskUpdatedDetail>).detail;
      if (!detail?.taskId) return;
      // Comment/activity wakes only need the activity panel — skip list fetch.
      if (detail.reason === "comment") return;

      if (detail.operation === "delete") {
        setLiveDeletedTaskIds((current) => {
          if (current.has(detail.taskId)) return current;
          const next = new Set(current);
          next.add(detail.taskId);
          return next;
        });
        setLiveTasksById((current) => {
          if (!current.has(detail.taskId)) return current;
          const next = new Map(current);
          next.delete(detail.taskId);
          return next;
        });
        return;
      }

      pendingIds.add(detail.taskId);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, TASK_LIVE_FETCH_DEBOUNCE_MS);
    };

    window.addEventListener(WORKSPACE_TASK_UPDATED_EVENT, onTaskUpdated);
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(WORKSPACE_TASK_UPDATED_EVENT, onTaskUpdated);
    };
  }, [authenticated, client]);

  return {
    apiTasks,
    setApiTasks,
    apiInboxTasks,
    setApiInboxTasks,
    apiProjects,
    setApiProjects,
    apiLetters,
    setApiLetters,
    apiContacts,
    setApiContacts,
    apiOrganizations,
    setApiOrganizations,
    apiAreas,
    setApiAreas,
    apiDocuments,
    setApiDocuments,
    liveDocumentsById,
    liveDeletedDocumentIds,
    liveProjectsById,
    setLiveProjectsById,
    liveDeletedProjectIds,
    liveMeetingsById,
    setLiveMeetingsById,
    liveDeletedMeetingIds,
    liveContactsById,
    liveDeletedContactIds,
    liveOrganizationsById,
    liveDeletedOrganizationIds,
    liveAreasById,
    liveDeletedAreaIds,
    liveHabitsById,
    liveDeletedHabitIds,
    liveLettersById,
    liveDeletedLetterIds,
    liveTasksById,
    liveDeletedTaskIds,
    apiHabits,
    setApiHabits,
    apiMeetings,
    setApiMeetings,
    restHydrateSettled,
    queriesGracePeriodExpired,
  };
}
