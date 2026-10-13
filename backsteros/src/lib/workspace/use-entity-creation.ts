import { useCallback } from "react";
import type {
  Area as ApiArea,
  Contact as ApiContact,
  Organization as ApiOrganization,
  Project as ApiProject,
} from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";
import { allocateUniqueProjectKey } from "@backsteros/ui";

import { optimisticLocalMetadataCreate } from "./optimistic-local-metadata-create";
import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";

/** Create/delete flows for organizations, contacts, projects, and areas. */
export function useWorkspaceEntityCreation({
  authenticated,
  client,
  powerSync,
  toSnakeFields,
  patchViaPowerSyncOrApi,
  rawProjects,
  setApiOrganizations,
  setApiContacts,
  setApiProjects,
  setApiAreas,
  softDeleteViaPowerSyncOrApi,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
  toSnakeFields: (values: Record<string, unknown>) => Record<string, unknown>;
  patchViaPowerSyncOrApi: (
    table: string,
    id: string,
    values: Record<string, unknown>,
  ) => Promise<{ number?: number } | void>;
  rawProjects: ApiProject[];
  setApiOrganizations: ApiRowsSetter<ApiOrganization>;
  setApiContacts: ApiRowsSetter<ApiContact>;
  setApiProjects: ApiRowsSetter<ApiProject>;
  setApiAreas: ApiRowsSetter<ApiArea>;
  softDeleteViaPowerSyncOrApi: (table: "areas", id: string) => Promise<void>;
}) {
  const entityKeyFromName = useCallback((name: string, fallback: string) => {
    const base = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 6);
    const suffix =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
        : `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    return `${base || fallback}${suffix}`;
  }, []);

  const createOrganization = useCallback(
    async (input: { name: string }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Organization name is required.");
      if (!authenticated) throw new Error("Sign in to create organizations.");
      const key = entityKeyFromName(name, "org");
      if (powerSync.ready && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const organization = {
          id,
          key,
          name,
          sortOrder: Date.now(),
          createdAt: now,
          updatedAt: now,
        } as ApiOrganization;
        const applyOptimistic = () => {
          setApiOrganizations((rows) => {
            const next = rows ? [...rows] : [];
            if (!next.some((entry) => entry.id === organization.id)) {
              next.push(organization);
            }
            return next;
          });
        };
        const { number } = await optimisticLocalMetadataCreate({
          id,
          applyOptimistic,
          rollback: () =>
            setApiOrganizations(
              (rows) => rows?.filter((entry) => entry.id !== id) ?? null,
            ),
          createMetadata: () =>
            powerSync.createMetadata!(
              "organizations",
              toSnakeFields({
                key,
                name,
                sortOrder: organization.sortOrder,
                number: null,
              }),
              id,
            ),
          errorLabel: "local organization create",
          resolveNumberAfterUpload: {
            client,
            powerSync,
            fetchPath: `/api/v1/organizations/${encodeURIComponent(id)}`,
            setters: [setApiOrganizations],
          },
        });
        return { id: organization.id, key: organization.key, number };
      }

      const organization = await client.requestJson<ApiOrganization>(
        "/api/v1/organizations",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            key,
            name,
            sortOrder: Date.now(),
          }),
        },
      );
      setApiOrganizations((rows) => {
        const next = rows ? [...rows] : [];
        if (!next.some((entry) => entry.id === organization.id)) {
          next.push(organization);
        }
        return next;
      });
      return { id: organization.id, key: organization.key };
    },
    [authenticated, client, entityKeyFromName, powerSync, setApiOrganizations, toSnakeFields],
  );

  const createContact = useCallback(
    async (input: {
      name?: string;
      firstName?: string;
      lastName?: string | null;
      organizationId?: string | null;
    }) => {
      const firstName = (input.firstName ?? input.name ?? "").trim();
      const lastName = (input.lastName ?? "").trim();
      const name = [firstName, lastName].filter(Boolean).join(" ");
      if (!firstName) throw new Error("Contact first name is required.");
      if (!authenticated) throw new Error("Sign in to create contacts.");
      const key = entityKeyFromName(name || firstName, "person");
      if (powerSync.ready && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const contact = {
          id,
          key,
          name,
          firstName,
          lastName,
          organizationId: input.organizationId ?? null,
          sortOrder: Date.now(),
          createdAt: now,
          updatedAt: now,
        } as ApiContact;
        const applyOptimistic = () => {
          setApiContacts((rows) => {
            const next = rows ? [...rows] : [];
            if (!next.some((entry) => entry.id === contact.id)) {
              next.push(contact);
            }
            return next;
          });
        };
        const { number } = await optimisticLocalMetadataCreate({
          id,
          applyOptimistic,
          rollback: () =>
            setApiContacts(
              (rows) => rows?.filter((entry) => entry.id !== id) ?? null,
            ),
          createMetadata: () =>
            powerSync.createMetadata!(
              "contacts",
              toSnakeFields({
                key,
                name,
                firstName,
                lastName,
                organizationId: contact.organizationId,
                sortOrder: contact.sortOrder,
                number: null,
              }),
              id,
            ),
          errorLabel: "local contact create",
          resolveNumberAfterUpload: {
            client,
            powerSync,
            fetchPath: `/api/v1/contacts/${encodeURIComponent(id)}`,
            setters: [setApiContacts],
          },
        });
        return { id: contact.id, key: contact.key, number };
      }

      const contact = await client.requestJson<ApiContact>("/api/v1/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          firstName,
          lastName,
          organizationId: input.organizationId ?? null,
          sortOrder: Date.now(),
        }),
      });
      setApiContacts((rows) => {
        const next = rows ? [...rows] : [];
        if (!next.some((entry) => entry.id === contact.id)) {
          next.push(contact);
        }
        return next;
      });
      return { id: contact.id, key: contact.key };
    },
    [authenticated, client, entityKeyFromName, powerSync, setApiContacts, toSnakeFields],
  );

  const createProject = useCallback(
    async (input: {
      name: string;
      status?: string;
      area?: string | null;
      organizationId?: string | null;
      type?: string;
    }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Project name is required.");
      if (!authenticated) throw new Error("Sign in to create projects.");
      const base = name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 3);
      const preferred = base.length >= 2 ? base : "PRJ";
      const key = allocateUniqueProjectKey(
        preferred,
        rawProjects.map((project) => project.key),
      );
      const body = {
        key,
        name,
        status: input.status ?? "backlog",
        area: input.area ?? null,
        sortOrder: -Date.now(),
        organizationId: input.organizationId ?? null,
        ...(input.type ? { type: input.type } : {}),
      };
      // Linear-shaped: PowerSync-ready → local create only.
      if (powerSync.ready && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const project = {
          id,
          key,
          name,
          status: body.status,
          area: body.area,
          sortOrder: body.sortOrder,
          organizationId: body.organizationId,
          ...(body.type ? { type: body.type } : {}),
          createdAt: now,
          updatedAt: now,
        } as ApiProject;
        await optimisticLocalMetadataCreate({
          id,
          applyOptimistic: () => {
            setApiProjects((rows) => {
              if (!rows) return [project];
              if (rows.some((entry) => entry.id === project.id)) return rows;
              return [project, ...rows];
            });
          },
          rollback: () =>
            setApiProjects(
              (rows) => rows?.filter((entry) => entry.id !== id) ?? null,
            ),
          createMetadata: () =>
            powerSync.createMetadata!(
              "projects",
              toSnakeFields({
                key: project.key,
                name: project.name,
                status: project.status,
                area: body.area ?? null,
                sortOrder: body.sortOrder,
                organizationId: project.organizationId ?? null,
                ...(project.type ? { type: project.type } : {}),
              }),
              id,
            ),
          errorLabel: "local project create",
        });
        return { id: project.id, key: project.key };
      }

      const project = await client.requestJson<ApiProject>("/api/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setApiProjects((rows) => {
        if (!rows) return [project];
        if (rows.some((entry) => entry.id === project.id)) return rows;
        return [project, ...rows];
      });
      return { id: project.id, key: project.key };
    },
    [authenticated, client, powerSync, rawProjects, setApiProjects, toSnakeFields],
  );

  const createArea = useCallback(
    async (input: {
      name: string;
      parent: "personal" | "business" | "clients";
    }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Area name is required.");
      if (!authenticated) throw new Error("Sign in to create areas.");
      const body = {
        name,
        parent: input.parent,
        sortOrder: Date.now(),
      };
      if (powerSync.ready && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const area = {
          id,
          name,
          parent: input.parent,
          sortOrder: body.sortOrder,
          icon: null,
          color: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        } as ApiArea;
        await optimisticLocalMetadataCreate({
          id,
          applyOptimistic: () => {
            setApiAreas((rows) => {
              const next = rows ? [...rows] : [];
              if (!next.some((entry) => entry.id === area.id)) next.push(area);
              return next;
            });
          },
          rollback: () =>
            setApiAreas((rows) => rows?.filter((entry) => entry.id !== id) ?? null),
          createMetadata: () =>
            powerSync.createMetadata!(
              "areas",
              toSnakeFields({
                name: area.name,
                parent: area.parent,
                sortOrder: area.sortOrder,
              }),
              id,
            ),
          errorLabel: "local area create",
        });
        return { id: area.id };
      }

      const area = await client.requestJson<ApiArea>("/api/v1/areas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setApiAreas((rows) => {
        const next = rows ? [...rows] : [];
        if (!next.some((entry) => entry.id === area.id)) next.push(area);
        return next;
      });
      return { id: area.id };
    },
    [authenticated, client, powerSync, setApiAreas, toSnakeFields],
  );

  const softDeleteArea = useCallback(
    async (id: string) => {
      if (!authenticated) throw new Error("Sign in to delete areas.");
      const affected = rawProjects.filter((project) => project.areaId === id);
      await Promise.all(
        affected.map((project) =>
          patchViaPowerSyncOrApi("projects", project.id, { areaId: null }),
        ),
      );
      await softDeleteViaPowerSyncOrApi("areas", id);
    },
    [
      authenticated,
      patchViaPowerSyncOrApi,
      rawProjects,
      softDeleteViaPowerSyncOrApi,
    ],
  );

  return {
    createOrganization,
    createContact,
    createProject,
    createArea,
    softDeleteArea,
  };
}
