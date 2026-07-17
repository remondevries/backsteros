"use client";

import type { Task as ApiTask } from "@backsteros/contracts";

import {
  getContactHref,
  getContactTaskHrefFromKey,
  getInboxTaskHref,
  getOrganizationHref,
  getProjectTaskHref,
} from "@/lib/entity-route-hrefs";
import { normalizeTask } from "@/lib/entity-normalize";
import {
  encodeLetterSlug,
  encodeProjectSlug,
  encodeTaskSlug,
  isEntityRouteUuid,
  parseTaskSlug,
} from "@/lib/entity-slugs";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";
import { resolveNavigationTrailCore } from "@/lib/navigation-trail/resolve-trail-core";
import type { ResolvedNavigationTrailEntity } from "@/lib/navigation-trail/resolved-entity";
import type {
  NavigationTrail,
  NavigationTrailEntityRef,
  ResolvedNavigationTrailItem,
} from "@/lib/navigation-trail/types";

export type TrailResolveContext = {
  tasks: ApiTask[];
  projects: { id: string; key: string; name: string }[];
  contacts: { id: string; key: string; name: string }[];
  organizations: { id: string; key: string; name: string }[];
  letters: { id: string; number: number | null; title: string }[];
  documents: {
    id: string;
    projectId: string | null;
    path: string;
    title: string;
  }[];
};

function taskContextKey(
  ctx: TrailResolveContext,
  task: ReturnType<typeof normalizeTask>,
): string {
  if (task.projectId) {
    const project = ctx.projects.find((entry) => entry.id === task.projectId);
    if (project) {
      return project.key;
    }
  }
  if (task.contactId) {
    const contact = ctx.contacts.find((entry) => entry.id === task.contactId);
    if (contact) {
      return contact.key;
    }
  }
  return INBOX_TASK_KEY;
}

function findTask(
  ctx: TrailResolveContext,
  routeParamOrId: string,
): ReturnType<typeof normalizeTask> | null {
  const byId = ctx.tasks.find((task) => task.id === routeParamOrId);
  if (byId) {
    return normalizeTask(byId);
  }

  const parsed = parseTaskSlug(routeParamOrId);
  if (!parsed) {
    return null;
  }

  const match = ctx.tasks.find((task) => {
    const normalized = normalizeTask(task);
    if (normalized.number !== parsed.number) {
      return false;
    }
    return (
      encodeProjectSlug(taskContextKey(ctx, normalized)) ===
      encodeProjectSlug(parsed.contextKey)
    );
  });

  return match ? normalizeTask(match) : null;
}

export function resolveNavigationTrailEntity(
  ref: NavigationTrailEntityRef,
  ctx: TrailResolveContext,
): ResolvedNavigationTrailEntity | null {
  if (ref.kind === "organization") {
    const organization = ctx.organizations.find(
      (entry) =>
        entry.id === ref.entityId ||
        entry.id === ref.routeParam ||
        encodeProjectSlug(entry.key) === encodeProjectSlug(ref.routeParam) ||
        entry.key.toLowerCase() === ref.routeParam.toLowerCase(),
    );
    if (!organization) {
      return null;
    }
    const routeParam = organization.key;
    return {
      ref: { kind: "organization", routeParam, entityId: organization.id },
      canonicalHref: getOrganizationHref({ key: organization.key, id: organization.id }),
      label: organization.name,
    };
  }

  if (ref.kind === "project") {
    const project = ctx.projects.find(
      (entry) =>
        entry.id === ref.entityId ||
        entry.id === ref.routeParam ||
        encodeProjectSlug(entry.key) === encodeProjectSlug(ref.routeParam),
    );
    if (!project) {
      return null;
    }
    const routeParam = encodeProjectSlug(project.key);
    return {
      ref: { kind: "project", routeParam, entityId: project.id },
      canonicalHref: `/projects/${routeParam}`,
      label: project.name,
    };
  }

  if (ref.kind === "contact") {
    const contact = ctx.contacts.find(
      (entry) =>
        entry.id === ref.entityId ||
        entry.id === ref.routeParam ||
        entry.key.toLowerCase() === ref.routeParam.toLowerCase(),
    );
    if (!contact) {
      return null;
    }
    return {
      ref: { kind: "contact", routeParam: contact.key, entityId: contact.id },
      canonicalHref: getContactHref({ key: contact.key, id: contact.id }),
      label: contact.name,
    };
  }

  if (ref.kind === "letter") {
    const letter = ctx.letters.find(
      (entry) =>
        entry.id === ref.entityId ||
        (entry.number != null &&
          encodeLetterSlug(entry.number) === ref.routeParam) ||
        entry.id === ref.routeParam,
    );
    if (!letter || letter.number == null) {
      return null;
    }
    const routeParam = encodeLetterSlug(letter.number);
    return {
      ref: { kind: "letter", routeParam, entityId: letter.id },
      canonicalHref: `/letters/${routeParam}`,
      label: letter.title,
    };
  }

  if (ref.kind === "task") {
    const lookup = ref.entityId ?? ref.routeParam;
    const task = findTask(ctx, lookup);
    if (!task) {
      return null;
    }
    const project = task.projectId
      ? ctx.projects.find((entry) => entry.id === task.projectId)
      : null;
    const contact = task.contactId
      ? ctx.contacts.find((entry) => entry.id === task.contactId)
      : null;
    const contextKey = taskContextKey(ctx, task);
    const routeParam = encodeTaskSlug(contextKey, task.number);
    const canonicalHref = project
      ? getProjectTaskHref(project.key, task.number)
      : contact
        ? getContactTaskHrefFromKey(contact.key, task.number)
        : getInboxTaskHref(task.number);
    return {
      ref: { kind: "task", routeParam, entityId: task.id },
      canonicalHref,
      label: `${routeParam.toUpperCase()} ${task.title}`,
    };
  }

  const document = ref.entityId
    ? ctx.documents.find((entry) => entry.id === ref.entityId)
    : ctx.documents.find(
        (entry) =>
          entry.path === ref.relativePath &&
          (ref.projectRouteParam
            ? ctx.projects.some(
                (project) =>
                  project.id === entry.projectId &&
                  encodeProjectSlug(project.key) ===
                    encodeProjectSlug(ref.projectRouteParam),
              )
            : entry.projectId == null),
      );
  if (!document) {
    return null;
  }
  const project = document.projectId
    ? ctx.projects.find((entry) => entry.id === document.projectId)
    : null;
  const projectRouteParam = project ? encodeProjectSlug(project.key) : "";
  return {
    ref: {
      kind: "document",
      projectRouteParam,
      relativePath: document.path,
      entityId: document.id,
    },
    canonicalHref: project
      ? `/projects/${projectRouteParam}/documents/${document.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`
      : `/knowledge/${document.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
    label: document.title,
  };
}

export async function resolveNavigationTrailClient(
  trail: NavigationTrail,
  ctx: TrailResolveContext,
): Promise<{
  trail: NavigationTrail;
  items: ResolvedNavigationTrailItem[];
  target: ResolvedNavigationTrailEntity;
} | null> {
  return resolveNavigationTrailCore(trail, (ref) =>
    resolveNavigationTrailEntity(ref, ctx),
  );
}

export function taskLabelFromContext(
  ctx: TrailResolveContext,
  routeParam: string,
): string | null {
  const task = findTask(ctx, routeParam);
  if (!task) {
    return null;
  }
  const contextKey = taskContextKey(ctx, task);
  return `${encodeTaskSlug(contextKey, task.number).toUpperCase()} ${task.title}`;
}

export function isTrailEntityId(value: string): boolean {
  return isEntityRouteUuid(value);
}
