"use client";

import type {
  Contact as ApiContact,
  Organization as ApiOrganization,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";

import {
  normalizeContact,
  normalizeOrganization,
  normalizeProject,
  normalizeTask,
} from "@/lib/entity-normalize";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import type { AssignableProject } from "@/lib/projects/assignable-project";
import type { AssignableOrganization } from "@/lib/organizations/assignable-organization";

import { getMutationContext } from "./client";

export async function listAssignableContacts(): Promise<AssignableContact[]> {
  const { client } = getMutationContext();
  const { contacts } = await client.requestJson<{ contacts: ApiContact[] }>(
    "/api/v1/contacts",
  );
  return contacts.map((contact) => {
    const normalized = normalizeContact(contact);
    return {
      id: normalized.id,
      name: normalized.name,
      key: normalized.key,
      number: normalized.number,
      email: normalized.email,
      organizationId: normalized.organizationId,
      organizationName: null,
      avatarStorageKey: normalized.avatarStorageKey,
      avatarUpdatedAt: normalized.updatedAt.getTime(),
    } satisfies AssignableContact;
  });
}

export async function listAssignableProjects(): Promise<AssignableProject[]> {
  const { client } = getMutationContext();
  const { projects } = await client.requestJson<{ projects: ApiProject[] }>(
    "/api/v1/projects",
  );
  return projects.map((project) => {
    const normalized = normalizeProject(project);
    return {
      id: normalized.id,
      name: normalized.name,
      key: normalized.key,
      icon: normalized.icon,
      color: normalized.color,
    } satisfies AssignableProject;
  });
}

export async function listAssignableOrganizations(): Promise<
  AssignableOrganization[]
> {
  const { client } = getMutationContext();
  const { organizations } = await client.requestJson<{
    organizations: ApiOrganization[];
  }>("/api/v1/organizations");
  return organizations.map((organization) => {
    const normalized = normalizeOrganization(organization);
    return {
      id: normalized.id,
      name: normalized.name,
      key: normalized.key,
      number: normalized.number,
      avatarStorageKey: normalized.avatarStorageKey,
      avatarUpdatedAt: normalized.updatedAt.getTime(),
    } satisfies AssignableOrganization;
  });
}

export async function listNormalizedTasks(query = "") {
  const { client } = getMutationContext();
  const path = query ? `/api/v1/tasks?${query}` : "/api/v1/tasks";
  const { tasks } = await client.requestJson<{ tasks: ApiTask[] }>(path);
  return tasks.map(normalizeTask);
}

export async function listNormalizedInboxTasks() {
  const { client } = getMutationContext();
  const { tasks } = await client.requestJson<{ tasks: ApiTask[] }>(
    "/api/v1/tasks/inbox",
  );
  return tasks.map(normalizeTask);
}

export async function listNormalizedProjects(query = "") {
  const { client } = getMutationContext();
  const path = query ? `/api/v1/projects?${query}` : "/api/v1/projects";
  const { projects } = await client.requestJson<{ projects: ApiProject[] }>(path);
  return projects.map(normalizeProject);
}

export async function listNormalizedContacts() {
  const { client } = getMutationContext();
  const { contacts } = await client.requestJson<{ contacts: ApiContact[] }>(
    "/api/v1/contacts",
  );
  return contacts.map(normalizeContact);
}
