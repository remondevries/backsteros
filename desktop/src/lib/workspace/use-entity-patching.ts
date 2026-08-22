import { useCallback } from "react";
import type {
  Contact as ApiContact,
  Document as ApiDocument,
  Letter as ApiLetter,
  Organization as ApiOrganization,
  Project as ApiProject,
  Meeting as ApiMeeting,
  Task as ApiTask,
} from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

import { nudgeDynamicIslandTasksRefresh } from "../dynamic-island-nudge";
import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";

export type SoftDeletableTable =
  | "tasks"
  | "projects"
  | "letters"
  | "meetings"
  | "contacts"
  | "organizations"
  | "documents";

/**
 * Optimistic patch / soft-delete pipeline shared by every entity: local
 * PowerSync SQLite first, then REST, then API cache updates.
 */
export function useWorkspaceEntityPatching({
  authenticated,
  client,
  powerSync,
  setApiTasks,
  setApiInboxTasks,
  setApiProjects,
  setApiLetters,
  setApiContacts,
  setApiOrganizations,
  setApiMeetings,
  setApiDocuments,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
  setApiTasks: ApiRowsSetter<ApiTask>;
  setApiInboxTasks: ApiRowsSetter<ApiTask>;
  setApiProjects: ApiRowsSetter<ApiProject>;
  setApiLetters: ApiRowsSetter<ApiLetter>;
  setApiContacts: ApiRowsSetter<ApiContact>;
  setApiOrganizations: ApiRowsSetter<ApiOrganization>;
  setApiMeetings: ApiRowsSetter<ApiMeeting>;
  setApiDocuments: ApiRowsSetter<ApiDocument>;
}) {
  const toSnakeFields = useCallback((values: Record<string, unknown>) => {
    const snake: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      );
      if (value === true) {
        snake[snakeKey] = 1;
      } else if (value === false) {
        snake[snakeKey] = 0;
      } else if (value !== null && typeof value === "object") {
        // PowerSync text columns (e.g. social_accounts) store JSON as text.
        snake[snakeKey] = JSON.stringify(value);
      } else {
        snake[snakeKey] = value;
      }
    }
    return snake;
  }, []);

  const seedDocumentLocal = useCallback(
    async (document: ApiDocument) => {
      if (!powerSync.ready || !powerSync.createMetadata) return;
      try {
        await powerSync.createMetadata(
          "documents",
          toSnakeFields({
            type: document.type,
            projectId: document.projectId ?? null,
            parentId: document.parentId ?? null,
            kind: document.kind ?? "document",
            icon: document.icon ?? null,
            sortOrder: document.sortOrder ?? 0,
            journalDate: document.journalDate ?? null,
            path: document.path,
            title: document.title,
            storageKey: document.storageKey ?? "",
            contentType: document.contentType ?? "text/markdown",
            byteSize: document.byteSize ?? 0,
            checksum: document.checksum ?? null,
            snippet: document.snippet ?? null,
            contentVersion: document.contentVersion ?? 1,
            contentEtag: document.contentEtag ?? null,
          }),
          document.id,
        );
      } catch {
        // Non-fatal: download sync will eventually bring the row in.
      }
    },
    [powerSync, toSnakeFields],
  );

  const entityPatchPath = useCallback((table: string, id: string) => {
    if (table === "tasks") return `/api/v1/tasks/${encodeURIComponent(id)}`;
    if (table === "projects")
      return `/api/v1/projects/${encodeURIComponent(id)}`;
    if (table === "letters")
      return `/api/v1/letters/${encodeURIComponent(id)}`;
    if (table === "meetings")
      return `/api/v1/meetings/${encodeURIComponent(id)}`;
    if (table === "contacts")
      return `/api/v1/contacts/${encodeURIComponent(id)}`;
    if (table === "documents")
      return `/api/v1/documents/${encodeURIComponent(id)}`;
    return `/api/v1/organizations/${encodeURIComponent(id)}`;
  }, []);

  const applyApiTaskPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      const patchRows = (rows: ApiTask[] | null): ApiTask[] | null => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({ ...row, ...values, updatedAt: nextUpdatedAt } as ApiTask)
            : row,
        );
      };
      setApiTasks(patchRows);
      setApiInboxTasks(patchRows);
    },
    [setApiInboxTasks, setApiTasks],
  );

  const applyApiProjectPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      setApiProjects((rows) => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({ ...row, ...values, updatedAt: nextUpdatedAt } as ApiProject)
            : row,
        );
      });
    },
    [setApiProjects],
  );

  const applyApiOrganizationPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      setApiOrganizations((rows) => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({
                ...row,
                ...values,
                updatedAt: nextUpdatedAt,
              } as ApiOrganization)
            : row,
        );
      });
    },
    [setApiOrganizations],
  );

  const applyApiContactPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      setApiContacts((rows) => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({ ...row, ...values, updatedAt: nextUpdatedAt } as ApiContact)
            : row,
        );
      });
    },
    [setApiContacts],
  );

  const applyApiLetterPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      setApiLetters((rows) => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({ ...row, ...values, updatedAt: nextUpdatedAt } as ApiLetter)
            : row,
        );
      });
    },
    [setApiLetters],
  );

  const applyApiMeetingPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      setApiMeetings((rows) => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({ ...row, ...values, updatedAt: nextUpdatedAt } as ApiMeeting)
            : row,
        );
      });
    },
    [setApiMeetings],
  );

  const softRefreshApiTasks = useCallback(async () => {
    if (!authenticated) return;
    try {
      const [tasksBody, inboxTasksBody] = await Promise.all([
        client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks"),
        client.requestJson<{ tasks: ApiTask[] }>("/api/v1/tasks/inbox"),
      ]);
      setApiTasks(tasksBody.tasks);
      setApiInboxTasks(inboxTasksBody.tasks);
    } catch {
      // PowerSync remains the primary source.
    }
  }, [authenticated, client, setApiInboxTasks, setApiTasks]);

  const softRefreshApiProjects = useCallback(async () => {
    if (!authenticated) return;
    try {
      const projectsBody = await client.requestJson<{ projects: ApiProject[] }>(
        "/api/v1/projects",
      );
      setApiProjects(projectsBody.projects);
    } catch {
      // PowerSync remains the primary source.
    }
  }, [authenticated, client, setApiProjects]);

  const softRefreshApiMeetings = useCallback(async () => {
    if (!authenticated) return;
    try {
      const meetingsBody = await client.requestJson<{ meetings: ApiMeeting[] }>(
        "/api/v1/meetings",
      );
      setApiMeetings(meetingsBody.meetings);
    } catch {
      // PowerSync remains the primary source.
    }
  }, [authenticated, client, setApiMeetings]);

  const patchViaPowerSyncOrApi = useCallback(
    async (
      table: string,
      id: string,
      values: Record<string, unknown>,
    ): Promise<{ number?: number } | void> => {
      const path = entityPatchPath(table, id);

      const applyTaskServerRow = async (row: ApiTask | null | undefined) => {
        if (!row || table !== "tasks") return;
        const serverValues: Record<string, unknown> = {
          ...values,
          ...(typeof row.number === "number" ? { number: row.number } : {}),
          ...(row.projectId !== undefined ? { projectId: row.projectId } : {}),
        };
        applyApiTaskPatch(id, serverValues);
        // Scope moves renumber server-side; keep local SQLite in sync so the
        // display id / route slug match before PowerSync pull catches up.
        if (
          powerSync.ready &&
          powerSync.patchMetadata &&
          typeof row.number === "number" &&
          row.number !== values.number
        ) {
          try {
            await powerSync.patchMetadata("tasks", id, {
              number: row.number,
            });
          } catch (error) {
            console.warn("[desktop] local task number sync failed", error);
          }
        }
      };

      const applyMeetingServerRow = async (row: ApiMeeting | null | undefined) => {
        if (!row || table !== "meetings") return;
        applyApiMeetingPatch(id, {
          projectId: row.projectId,
          organizationId: row.organizationId,
          attendeeContactIds: row.attendeeContactIds,
          status: row.status,
          updatedAt: row.updatedAt,
        });
        if (powerSync.ready && powerSync.patchMetadata) {
          try {
            await powerSync.patchMetadata("meetings", id, toSnakeFields({
              projectId: row.projectId ?? null,
              organizationId: row.organizationId ?? null,
              attendeeContactIds: row.attendeeContactIds ?? [],
              status: row.status,
            }));
          } catch (error) {
            console.warn("[desktop] local meeting property sync failed", error);
          }
        }
      };

      const meetingPatchNeedsApiRefresh =
        table === "meetings" &&
        ("projectId" in values ||
          "organizationId" in values ||
          "attendeeContactIds" in values ||
          "status" in values);

      // Match Next.js: optimistic local SQLite + REST so other clients see
      // changes even when the PowerSync upload queue is slow or stalled.
      if (powerSync.ready && powerSync.patchMetadata) {
        try {
          await powerSync.patchMetadata(
            table as
              | "tasks"
              | "projects"
              | "letters"
              | "meetings"
              | "contacts"
              | "organizations"
              | "documents",
            id,
            toSnakeFields(values),
          );
        } catch (error) {
          // Local SQLite may lag schema (e.g. new columns). Still hit REST.
          console.warn("[desktop] local metadata patch failed", error);
          if (table === "tasks" && "dueEndDate" in values) {
            const { dueEndDate: _dueEndDate, ...rest } = values;
            if (Object.keys(rest).length > 0) {
              try {
                await powerSync.patchMetadata("tasks", id, toSnakeFields(rest));
              } catch (retryError) {
                console.warn("[desktop] local task patch retry failed", retryError);
              }
            }
          }
          if (table === "meetings") {
            const {
              projectId: _projectId,
              organizationId: _organizationId,
              attendeeContactIds: _attendeeContactIds,
              status: _status,
              ...rest
            } = values;
            if (Object.keys(rest).length > 0) {
              try {
                await powerSync.patchMetadata("meetings", id, toSnakeFields(rest));
              } catch (retryError) {
                console.warn("[desktop] local meeting patch retry failed", retryError);
              }
            }
          }
        }
        // Optimistic API cache — REST-created orgs/contacts may not exist in
        // local SQLite yet, so side panels would stay stale without this.
        if (table === "organizations") {
          applyApiOrganizationPatch(id, values);
        }
        if (table === "contacts") {
          applyApiContactPatch(id, values);
        }
        if (table === "letters") {
          applyApiLetterPatch(id, values);
        }
        if (table === "meetings") {
          applyApiMeetingPatch(id, values);
        }
        if (table === "tasks") {
          // Optimistic so agentChatId / status show in lists before REST returns.
          applyApiTaskPatch(id, values);
          if (typeof values.status === "string") {
            nudgeDynamicIslandTasksRefresh();
          }
        }
        if (!authenticated) return;
        try {
          const updated =
            table === "tasks"
              ? await client.requestJson<ApiTask>(path, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(values),
                })
              : table === "meetings"
                ? await client.requestJson<ApiMeeting>(path, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(values),
                  })
                : await client.requestJson(path, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(values),
                  });
          if (table === "tasks") {
            await applyTaskServerRow(updated as ApiTask);
            // Re-fetch when links / agent chat binding change so merge can fill
            // local SQLite gaps (stale schema often omits new columns).
            if ("links" in values || "agentChatId" in values) {
              void softRefreshApiTasks();
            }
            return typeof (updated as ApiTask)?.number === "number"
              ? { number: (updated as ApiTask).number }
              : undefined;
          }
          if (table === "meetings") {
            await applyMeetingServerRow(updated as ApiMeeting);
            if (meetingPatchNeedsApiRefresh) {
              void softRefreshApiMeetings();
            }
          }
          if (table === "projects") {
            applyApiProjectPatch(id, values);
            // Re-fetch when type / codebase binding changes so merge can fill
            // local SQLite gaps after restart.
            if (
              "type" in values ||
              "key" in values ||
              "githubRepository" in values ||
              "localWorkingDirectory" in values
            ) {
              void softRefreshApiProjects();
            }
          }
          if (table === "organizations") {
            applyApiOrganizationPatch(id, values);
          }
        } catch (error) {
          // Local write + upload queue remain the source of truth if REST fails —
          // except agent chat binding, which must land in Postgres.
          if ("agentChatId" in values) {
            throw error instanceof Error
              ? error
              : new Error("Could not persist agent chat on the task.");
          }
          if ("moneybirdContactId" in values) {
            throw error instanceof Error
              ? error
              : new Error("Could not link Moneybird contact on the organization.");
          }
        }
        return;
      }
      if (!authenticated) return;
      if (table === "tasks") {
        const updated = await client.requestJson<ApiTask>(path, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(values),
        });
        await applyTaskServerRow(updated);
        if ("links" in values || "agentChatId" in values) {
          void softRefreshApiTasks();
        }
        return typeof updated?.number === "number"
          ? { number: updated.number }
          : undefined;
      }
      if (table === "meetings") {
        const updated = await client.requestJson<ApiMeeting>(path, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(values),
        });
        await applyMeetingServerRow(updated);
        if (meetingPatchNeedsApiRefresh) {
          void softRefreshApiMeetings();
        }
        return;
      }
      await client.requestJson(path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (table === "projects") {
        applyApiProjectPatch(id, values);
        if (
          "type" in values ||
          "githubRepository" in values ||
          "localWorkingDirectory" in values
        ) {
          void softRefreshApiProjects();
        }
      }
      if (table === "organizations") {
        applyApiOrganizationPatch(id, values);
      }
      if (table === "contacts") {
        applyApiContactPatch(id, values);
      }
      if (table === "letters") {
        applyApiLetterPatch(id, values);
      }
    },
    [
      applyApiContactPatch,
      applyApiLetterPatch,
      applyApiMeetingPatch,
      applyApiOrganizationPatch,
      applyApiProjectPatch,
      applyApiTaskPatch,
      authenticated,
      client,
      entityPatchPath,
      powerSync,
      softRefreshApiProjects,
      softRefreshApiMeetings,
      softRefreshApiTasks,
      toSnakeFields,
    ],
  );

  const removeFromApiCache = useCallback((table: SoftDeletableTable, id: string) => {
    if (table === "tasks") {
      setApiTasks((rows) => rows?.filter((row) => row.id !== id) ?? null);
      setApiInboxTasks((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    if (table === "projects") {
      setApiProjects((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    if (table === "letters") {
      setApiLetters((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    if (table === "meetings") {
      setApiMeetings((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    if (table === "contacts") {
      setApiContacts((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    if (table === "organizations") {
      setApiOrganizations((rows) => rows?.filter((row) => row.id !== id) ?? null);
      return;
    }
    setApiDocuments((rows) => rows?.filter((row) => row.id !== id) ?? null);
  }, [
    setApiContacts,
    setApiDocuments,
    setApiInboxTasks,
    setApiLetters,
    setApiMeetings,
    setApiOrganizations,
    setApiProjects,
    setApiTasks,
  ]);

  const softDeleteViaPowerSyncOrApi = useCallback(
    async (table: SoftDeletableTable, id: string) => {
      const path = entityPatchPath(table, id);
      if (powerSync.ready && powerSync.patchMetadata) {
        await powerSync.patchMetadata(table, id, {
          deleted_at: new Date().toISOString(),
        });
        if (!authenticated) {
          throw new Error("Sign in to delete.");
        }
        try {
          await client.requestJson(path, { method: "DELETE" });
          removeFromApiCache(table, id);
        } catch {
          // Soft-delete remains queued for PowerSync upload.
        }
        return;
      }
      if (!authenticated) {
        throw new Error("Sign in to delete.");
      }
      await client.requestJson(path, { method: "DELETE" });
      removeFromApiCache(table, id);
    },
    [authenticated, client, entityPatchPath, powerSync, removeFromApiCache],
  );

  return {
    toSnakeFields,
    seedDocumentLocal,
    patchViaPowerSyncOrApi,
    softDeleteViaPowerSyncOrApi,
    softRefreshApiTasks,
  };
}
