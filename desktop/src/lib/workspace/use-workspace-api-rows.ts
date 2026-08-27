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
import type { BacksterosApiClient } from "@backsteros/api-client";

import { createRequestAbortSignal } from "../request-timeout";
import { preservePendingApiRows } from "../merge-local-and-api";
import type { WorkspacePowerSync } from "./workspace-data-types";

/**
 * REST-hydrated row caches for the workspace snapshot, plus the settle flags
 * used by the readiness computation in the main hook.
 *
 * Linear-shaped: cold-start rescue only — no soft-revalidate on sync epochs.
 */
export function useWorkspaceApiRows({
  authenticated,
  client,
  powerSync,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
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
      12_000,
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
    if (powerSync.ready && powerSync.lastSyncedAt) {
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
  }, [authenticated, client, powerSync.ready, powerSync.lastSyncedAt]);

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
    apiHabits,
    setApiHabits,
    apiMeetings,
    setApiMeetings,
    restHydrateSettled,
    queriesGracePeriodExpired,
  };
}
