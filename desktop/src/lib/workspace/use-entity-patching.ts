import { useCallback } from "react";
import type {
  Contact as ApiContact,
  Document as ApiDocument,
  Letter as ApiLetter,
  Organization as ApiOrganization,
  Project as ApiProject,
  Meeting as ApiMeeting,
  Task as ApiTask,
  Area as ApiArea,
} from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

import { nudgeDynamicIslandTasksRefresh } from "../dynamic-island-nudge";
import { preservePendingApiRows } from "../merge-local-and-api";
import { normalizeTaskPatchForLocalState } from "./inbox-acknowledge-patch";
import {
  shouldSkipRestAfterCrudFlush,
  shouldSkipRestEntityWrite,
  taskPatchRequiresRestWrite,
} from "./powersync-write-path";
import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";

/** Scope moves renumber server-side — client must await the new display number. */
function taskPatchChangesTaskScope(values: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(values, "projectId")
    || Object.prototype.hasOwnProperty.call(values, "contactId");
}

/** Title / received-date changes re-file vault PDFs — must hit REST `updateLetter`. */
function letterPatchRequiresVaultRelocate(
  values: Record<string, unknown>,
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(values, "title") ||
    Object.prototype.hasOwnProperty.call(values, "receivedDate")
  );
}

/**
 * Sole REST dual-write while PowerSync is connected — agent inbox approval.
 * See {@link taskPatchRequiresRestWrite}. Do not add further dual-writes here.
 */
function queueSoleRestDualWriteAgentInboxApproval(input: {
  client: BacksterosApiClient;
  path: string;
  table: string;
  values: Record<string, unknown>;
  apiValues: Record<string, unknown>;
  applyTaskServerRow: (row: ApiTask | null | undefined) => Promise<void>;
}): void {
  if (input.table !== "tasks" || !taskPatchRequiresRestWrite(input.values)) {
    return;
  }
  void input.client
    .requestJson<ApiTask>(input.path, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.apiValues),
    })
    .then((updated) => input.applyTaskServerRow(updated))
    .catch((error) => {
      console.warn(
        "[desktop] background agent inbox approval REST failed",
        error,
      );
    });
}

export type SoftDeletableTable =
  | "tasks"
  | "projects"
  | "areas"
  | "letters"
  | "meetings"
  | "contacts"
  | "organizations"
  | "documents";

/**
 * Optimistic patch / soft-delete pipeline shared by every entity: local
 * PowerSync SQLite first; REST only when PowerSync is not connected.
 */
export function useWorkspaceEntityPatching({
  authenticated,
  client,
  powerSync,
  setApiTasks,
  setApiInboxTasks,
  setApiProjects,
  setApiAreas,
  setApiLetters,
  setApiContacts,
  setApiOrganizations,
  setApiMeetings,
  setApiDocuments,
  getLocalTaskStatus,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
  setApiTasks: ApiRowsSetter<ApiTask>;
  setApiInboxTasks: ApiRowsSetter<ApiTask>;
  setApiProjects: ApiRowsSetter<ApiProject>;
  setApiAreas: ApiRowsSetter<ApiArea>;
  setApiLetters: ApiRowsSetter<ApiLetter>;
  setApiContacts: ApiRowsSetter<ApiContact>;
  setApiOrganizations: ApiRowsSetter<ApiOrganization>;
  setApiMeetings: ApiRowsSetter<ApiMeeting>;
  setApiDocuments: ApiRowsSetter<ApiDocument>;
  /**
   * PowerSync-local status for optimistic API cache merges. Due-date (and
   * other non-status) patches must not re-base onto a stale REST row that
   * still says `backlog` while SQLite already has `in_progress` (BOD-62).
   */
  getLocalTaskStatus?: (id: string) => string | null | undefined;
}) {
  const toSnakeFields = useCallback((values: Record<string, unknown>) => {
    const snake: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
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
    if (table === "areas") return `/api/v1/areas/${encodeURIComponent(id)}`;
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

  const applyApiDocumentPatch = useCallback(
    (id: string, values: Record<string, unknown>) => {
      const nextUpdatedAt = new Date().toISOString();
      setApiDocuments((rows) => {
        if (!rows) return rows;
        return rows.map((row) =>
          row.id === id
            ? ({ ...row, ...values, updatedAt: nextUpdatedAt } as ApiDocument)
            : row,
        );
      });
    },
    [setApiDocuments],
  );

  const applyOptimisticEntityPatch = useCallback(
    (table: string, id: string, values: Record<string, unknown>) => {
      const localValues =
        table === "tasks"
          ? normalizeTaskPatchForLocalState(values)
          : values;
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
      if (table === "projects") {
        applyApiProjectPatch(id, values);
      }
      if (table === "documents") {
        applyApiDocumentPatch(id, values);
      }
      if (table === "tasks") {
        applyApiTaskPatch(id, localValues);
        if (typeof localValues.status === "string") {
          nudgeDynamicIslandTasksRefresh();
        }
      }
    },
    [
      applyApiContactPatch,
      applyApiDocumentPatch,
      applyApiLetterPatch,
      applyApiMeetingPatch,
      applyApiOrganizationPatch,
      applyApiProjectPatch,
      applyApiTaskPatch,
    ],
  );

  const softRefreshApiTasks = useCallback(async () => {
    if (!authenticated || shouldSkipRestEntityWrite(powerSync)) return;
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
  }, [authenticated, client, powerSync, setApiInboxTasks, setApiTasks]);

  const softRefreshApiProjects = useCallback(async () => {
    if (!authenticated || shouldSkipRestEntityWrite(powerSync)) return;
    try {
      const projectsBody = await client.requestJson<{ projects: ApiProject[] }>(
        "/api/v1/projects",
      );
      setApiProjects((current) =>
        preservePendingApiRows(current, projectsBody.projects),
      );
    } catch {
      // PowerSync remains the primary source.
    }
  }, [authenticated, client, powerSync, setApiProjects]);

  const softRefreshApiMeetings = useCallback(async () => {
    if (!authenticated || shouldSkipRestEntityWrite(powerSync)) return;
    try {
      const meetingsBody = await client.requestJson<{ meetings: ApiMeeting[] }>(
        "/api/v1/meetings",
      );
      setApiMeetings(meetingsBody.meetings);
    } catch {
      // PowerSync remains the primary source.
    }
  }, [authenticated, client, powerSync, setApiMeetings]);

  /**
   * Pull document metadata from REST when PowerSync is not connected.
   * While connected, workspace SSE + PowerSync download are the live path —
   * list soft-refresh fought SQLite and reintroduced dual-hydrate flashes.
   */
  const softRefreshApiDocuments = useCallback(async () => {
    if (!authenticated || shouldSkipRestEntityWrite(powerSync)) return;
    try {
      const documentsBody = await client.requestJson<{
        documents: ApiDocument[];
      }>("/api/v1/documents");
      setApiDocuments((current) =>
        preservePendingApiRows(current, documentsBody.documents),
      );
    } catch {
      // PowerSync remains the primary source.
    }
  }, [authenticated, client, powerSync, setApiDocuments]);

  const patchViaPowerSyncOrApi = useCallback(
    async (
      table: string,
      id: string,
      values: Record<string, unknown>,
    ): Promise<{ number?: number } | void> => {
      const path = entityPatchPath(table, id);
      const apiValues = values;
      const localValues =
        table === "tasks"
          ? normalizeTaskPatchForLocalState(values)
          : values;

      const applyTaskServerRow = async (row: ApiTask | null | undefined) => {
        if (!row || table !== "tasks") return;
        const serverValues: Record<string, unknown> = {
          ...localValues,
          ...(typeof row.number === "number" ? { number: row.number } : {}),
          ...(row.projectId !== undefined ? { projectId: row.projectId } : {}),
          ...(row.agentInboxApprovedAt != null
            ? { agentInboxApprovedAt: row.agentInboxApprovedAt }
            : {}),
        };
        delete serverValues.agentInboxApproved;
        delete serverValues.acknowledgeInboxUpdate;
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
          locationOrganizationId: row.locationOrganizationId,
          attendeeContactIds: row.attendeeContactIds,
          status: row.status,
          format: row.format,
          updatedAt: row.updatedAt,
        });
        if (powerSync.ready && powerSync.patchMetadata) {
          try {
            await powerSync.patchMetadata("meetings", id, toSnakeFields({
              projectId: row.projectId ?? null,
              organizationId: row.organizationId ?? null,
              locationOrganizationId: row.locationOrganizationId ?? null,
              attendeeContactIds: row.attendeeContactIds ?? [],
              status: row.status,
              format: row.format ?? "video_call",
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
          "locationOrganizationId" in values ||
          "attendeeContactIds" in values ||
          "status" in values ||
          "format" in values);

      // Local SQLite first. Tier A/B UI reads watches; documents still warm api*.
      const persistLocalAndMaybeRest = async (): Promise<
        { number?: number } | void
      > => {
        try {
          await powerSync.patchMetadata!(
            table as
              | "tasks"
              | "projects"
              | "letters"
              | "meetings"
              | "contacts"
              | "organizations"
              | "documents",
            id,
            toSnakeFields(localValues),
          );
        } catch (error) {
          // Local SQLite may lag schema (e.g. new columns). Still hit REST.
          console.warn("[desktop] local metadata patch failed", error);
          if (table === "tasks" && "dueEndDate" in localValues) {
            const { dueEndDate: _dueEndDate, ...rest } = localValues;
            if (Object.keys(rest).length > 0) {
              try {
                await powerSync.patchMetadata!("tasks", id, toSnakeFields(rest));
              } catch (retryError) {
                console.warn(
                  "[desktop] local task patch retry failed",
                  retryError,
                );
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
                await powerSync.patchMetadata!(
                  "meetings",
                  id,
                  toSnakeFields(rest),
                );
              } catch (retryError) {
                console.warn(
                  "[desktop] local meeting patch retry failed",
                  retryError,
                );
              }
            }
          }
        }
        if (!authenticated) return;
        // PowerSync upload is primary. Extra REST only for:
        // - agentInboxApproved (replication race) via queueSoleRest…
        // - project/contact scope moves (server renumbers; URL needs the number)
        if (shouldSkipRestEntityWrite(powerSync)) {
          queueSoleRestDualWriteAgentInboxApproval({
            client,
            path,
            table,
            values,
            apiValues,
            applyTaskServerRow,
          });
          if (table === "tasks" && taskPatchChangesTaskScope(values)) {
            try {
              const updated = await client.requestJson<ApiTask>(path, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(apiValues),
              });
              await applyTaskServerRow(updated);
              return typeof updated?.number === "number"
                ? { number: updated.number }
                : undefined;
            } catch (error) {
              console.warn("[desktop] task scope move REST failed", error);
              return;
            }
          }
          if (table === "letters" && letterPatchRequiresVaultRelocate(values)) {
            try {
              await client.requestJson(path, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(apiValues),
              });
            } catch (error) {
              console.warn("[desktop] letter vault relocate REST failed", error);
              throw error instanceof Error
                ? error
                : new Error("Could not rename letter PDF on disk.");
            }
            return;
          }
          let uploaded: boolean | void = false;
          try {
            uploaded = await powerSync.flushCrudUpload();
          } catch (error) {
            console.warn(
              `[desktop] PowerSync upload flush failed for ${table}; falling back to REST`,
              error,
            );
          }
          // Status patches used to dual-write REST "because PowerSync stranded"
          // — that re-fought SQLite. Await flush above; fall through to REST
          // only when the upload queue was empty or flush failed.
          if (shouldSkipRestAfterCrudFlush(uploaded)) return;
        }
        try {
          const updated =
            table === "tasks"
              ? await client.requestJson<ApiTask>(path, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(apiValues),
                })
              : table === "meetings"
                ? await client.requestJson<ApiMeeting>(path, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(apiValues),
                  })
                : await client.requestJson(path, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(apiValues),
                  });
          if (table === "tasks") {
            await applyTaskServerRow(updated as ApiTask);
            return typeof (updated as ApiTask)?.number === "number"
              ? { number: (updated as ApiTask).number }
              : undefined;
          }
          if (table === "meetings") {
            await applyMeetingServerRow(updated as ApiMeeting);
          }
        } catch (error) {
          // Local write + upload queue remain the source of truth if REST fails —
          // except agent chat binding, which must land in Postgres.
          if ("agentChatId" in values) {
            throw error instanceof Error
              ? error
              : new Error("Could not persist agent chat on the task.");
          }
          if ("linkedCommitShas" in values) {
            throw error instanceof Error
              ? error
              : new Error("Could not persist linked commits on the task.");
          }
          if (taskPatchRequiresRestWrite(values)) {
            throw error instanceof Error
              ? error
              : new Error("Could not approve agent-created task.");
          }
          if ("moneybirdContactId" in values) {
            throw error instanceof Error
              ? error
              : new Error("Could not link Moneybird contact on the organization.");
          }
        }
      };

      // Optimistic local SQLite is authoritative for Tier A/B lists. Skip
      // bumping the REST api* cache for those tables when PowerSync is ready —
      // resolveLocalOrApiRows ignores newer API overlays. Documents still warm
      // apiDocuments for pending shell creates (SSE uses liveDocumentsById).
      if (powerSync.ready) {
        // Non-status task patches (due date, priority, …) must not re-base the
        // API cache onto a stale REST row whose status still says backlog while
        // PowerSync already has in_progress — that made due-date edits flip the
        // status label (BOD-62). Inject local status into the optimistic cache
        // only; SQLite / upload still use `values` without a status write.
        let optimisticValues = values;
        if (
          table === "tasks" &&
          values.status === undefined &&
          getLocalTaskStatus
        ) {
          const localStatus = getLocalTaskStatus(id);
          if (typeof localStatus === "string" && localStatus.trim()) {
            optimisticValues = { ...values, status: localStatus };
          }
        }
        if (table === "documents") {
          applyOptimisticEntityPatch(table, id, optimisticValues);
        } else if (table === "tasks" && typeof values.status === "string") {
          nudgeDynamicIslandTasksRefresh();
        }
        const mustAwaitRest =
          authenticated &&
          ("agentChatId" in values ||
            "linkedCommitShas" in values ||
            "moneybirdContactId" in values ||
            (table === "tasks" && typeof values.status === "string") ||
            (table === "tasks" && taskPatchChangesTaskScope(values)) ||
            (table === "letters" && letterPatchRequiresVaultRelocate(values)));
        if (mustAwaitRest) {
          const result = await persistLocalAndMaybeRest();
          if ("linkedCommitShas" in values) {
            void softRefreshApiTasks();
          }
          return result;
        }
        void persistLocalAndMaybeRest();
        return;
      }
      if (!authenticated) return;
      if (table === "tasks") {
        const updated = await client.requestJson<ApiTask>(path, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(apiValues),
        });
        await applyTaskServerRow(updated);
        if ("links" in apiValues || "agentChatId" in apiValues || "linkedCommitShas" in apiValues) {
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
      applyOptimisticEntityPatch,
      applyApiOrganizationPatch,
      applyApiProjectPatch,
      applyApiTaskPatch,
      authenticated,
      client,
      entityPatchPath,
      getLocalTaskStatus,
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
    if (table === "areas") {
      setApiAreas((rows) => rows?.filter((row) => row.id !== id) ?? null);
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
    setApiAreas,
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
        removeFromApiCache(table, id);
        if (!authenticated) {
          throw new Error("Sign in to delete.");
        }
        if (shouldSkipRestEntityWrite(powerSync)) {
          try {
            const uploaded = await powerSync.flushCrudUpload();
            if (shouldSkipRestAfterCrudFlush(uploaded)) return;
          } catch (error) {
            console.warn(
              `[desktop] PowerSync delete upload flush failed for ${table}; falling back to REST`,
              error,
            );
          }
        }
        try {
          await client.requestJson(path, { method: "DELETE" });
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
    softRefreshApiDocuments,
  };
}
