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
import { preservePendingApiRows } from "../merge-local-and-api";
import {
  WORKSPACE_DOCUMENT_UPDATED_EVENT,
  WORKSPACE_PROJECT_UPDATED_EVENT,
  type WorkspaceDocumentUpdatedDetail,
  type WorkspaceProjectUpdatedDetail,
} from "../workspace-events";
import {
  shouldDesktopRestHydrateColdStart,
  shouldDesktopSkipRestHydrateAfterSync,
} from "./rest-list-hydration-policy";
import type { WorkspacePowerSync } from "./workspace-data-types";

/** Coalesce bursty agent reorder/move SSE into one metadata fetch. */
const DOCUMENT_LIVE_FETCH_DEBOUNCE_MS = 100;
const PROJECT_LIVE_FETCH_DEBOUNCE_MS = 100;

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
              const next = new Map(current);
              next.set(row.id, row);
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
    liveDeletedProjectIds,
    apiHabits,
    setApiHabits,
    apiMeetings,
    setApiMeetings,
    restHydrateSettled,
    queriesGracePeriodExpired,
  };
}
