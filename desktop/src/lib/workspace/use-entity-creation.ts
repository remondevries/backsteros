import { useCallback } from "react";
import type {
  Area as ApiArea,
  Contact as ApiContact,
  Organization as ApiOrganization,
  Project as ApiProject,
} from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

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
    return (base || fallback) + Math.floor(Math.random() * 90 + 10);
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
        setApiOrganizations((rows) => {
          const next = rows ? [...rows] : [];
          if (!next.some((entry) => entry.id === organization.id)) {
            next.push(organization);
          }
          return next;
        });
        void powerSync
          .createMetadata(
            "organizations",
            toSnakeFields({
              key,
              name,
              sortOrder: organization.sortOrder,
            }),
            id,
          )
          .catch((error) => {
            console.warn("[desktop] local organization create failed", error);
          });
        return { id: organization.id, key: organization.key };
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
    async (input: { name: string; organizationId?: string | null }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Contact name is required.");
      if (!authenticated) throw new Error("Sign in to create contacts.");
      const key = entityKeyFromName(name, "person");
      if (powerSync.ready && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const contact = {
          id,
          key,
          name,
          organizationId: input.organizationId ?? null,
          sortOrder: Date.now(),
          createdAt: now,
          updatedAt: now,
        } as ApiContact;
        setApiContacts((rows) => {
          const next = rows ? [...rows] : [];
          if (!next.some((entry) => entry.id === contact.id)) {
            next.push(contact);
          }
          return next;
        });
        void powerSync
          .createMetadata(
            "contacts",
            toSnakeFields({
              key,
              name,
              organizationId: contact.organizationId,
              sortOrder: contact.sortOrder,
            }),
            id,
          )
          .catch((error) => {
            console.warn("[desktop] local contact create failed", error);
          });
        return { id: contact.id, key: contact.key };
      }

      const contact = await client.requestJson<ApiContact>("/api/v1/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          name,
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
      const key = base.length >= 2 ? base : "PRJ";
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
        setApiProjects((rows) => {
          if (!rows) return [project];
          if (rows.some((entry) => entry.id === project.id)) return rows;
          return [project, ...rows];
        });
        void powerSync
          .createMetadata(
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
          )
          .catch((error) => {
            console.warn("[desktop] local project create failed", error);
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
    [authenticated, client, powerSync, setApiProjects, toSnakeFields],
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
        setApiAreas((rows) => {
          const next = rows ? [...rows] : [];
          if (!next.some((entry) => entry.id === area.id)) next.push(area);
          return next;
        });
        void powerSync
          .createMetadata(
            "areas",
            toSnakeFields({
              name: area.name,
              parent: area.parent,
              sortOrder: area.sortOrder,
            }),
            id,
          )
          .catch((error) => {
            console.warn("[desktop] local area create failed", error);
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
