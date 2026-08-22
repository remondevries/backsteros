import { useEffect, useState } from "react";
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

  const syncEpoch = powerSync.lastSyncedAt?.getTime() ?? 0;

  // Always hydrate lists from REST when signed in. PowerSync remains the
  // primary merge source once local rows exist, but packaged desktop builds
  // can be "ready" with an empty SQLite if the sync stream never connects
  // (e.g. Tailscale PowerSync endpoint from WKWebView) — without this, Projects
  // / Tasks / Inbox stay empty even though core has data.
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const signal = createRequestAbortSignal();
    const markHydrated = () => {
      setApiDocuments((current) => current ?? []);
      setApiTasks((current) => current ?? []);
      setApiInboxTasks((current) => current ?? []);
      setApiProjects((current) => current ?? []);
      setApiAreas((current) => current ?? []);
      setApiOrganizations((current) => current ?? []);
      setApiContacts((current) => current ?? []);
      setApiLetters((current) => current ?? []);
      setApiHabits((current) => current ?? []);
    };
    void (async () => {
      try {
        const [
          documentsBody,
          tasksBody,
          inboxTasksBody,
          projectsBody,
          areasBody,
          orgsBody,
          contactsBody,
          lettersBody,
        ] = await Promise.all([
          client.requestJson<{ documents: ApiDocument[] }>(
            "/api/v1/documents",
            { signal },
          ),
          client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks", { signal }),
          client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks/inbox", {
            signal,
          }),
          client.requestJson<{ projects: ApiProject[] }>("/api/v1/projects", {
            signal,
          }),
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
        setApiTasks(tasksBody.tasks);
        setApiInboxTasks(inboxTasksBody.tasks);
        setApiProjects(projectsBody.projects);
        setApiAreas(areasBody.areas);
        setApiOrganizations(orgsBody.organizations);
        setApiContacts(contactsBody.contacts);
        setApiLetters((current) =>
          preservePendingApiRows(current, lettersBody.letters),
        );
      } catch {
        if (cancelled) return;
        markHydrated();
      }

      try {
        const habitsBody = await client.requestJson<{ habits: ApiHabit[] }>(
          "/api/v1/habits",
          { signal },
        );
        if (cancelled) return;
        setApiHabits(habitsBody.habits);
        const meetingsBody = await client.requestJson<{ meetings: ApiMeeting[] }>(
          "/api/v1/meetings",
          { signal },
        );
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
          markHydrated();
          setRestHydrateSettled(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, client, syncEpoch]);

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
