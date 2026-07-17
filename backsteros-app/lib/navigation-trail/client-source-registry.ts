"use client";

import {
  resolveNavigationSourceCore,
  type NavigationSourceContext,
} from "@/lib/navigation-trail/source-resolution-core";
import type { ResolvedNavigationSource } from "@/lib/navigation-trail/source-types";

import {
  taskLabelFromContext,
  type TrailResolveContext,
} from "./client-entity-registry";

export type { TrailResolveContext };

function buildSourceContext(ctx: TrailResolveContext): NavigationSourceContext {
  return {
    taskLabel: (routeParam) => taskLabelFromContext(ctx, routeParam),
    resolveOrganizationByRouteParam: (param) => {
      const organization = ctx.organizations.find(
        (entry) =>
          entry.id === param ||
          entry.key.toLowerCase() === param.toLowerCase(),
      );
      return organization ? { name: organization.name } : null;
    },
    resolveProjectByRouteParam: (param) => {
      const project = ctx.projects.find(
        (entry) =>
          entry.id === param ||
          entry.key.toLowerCase() === param.toLowerCase(),
      );
      return project ? { id: project.id, name: project.name } : null;
    },
    resolveContactByRouteParam: (param) => {
      const contact = ctx.contacts.find(
        (entry) =>
          entry.id === param ||
          entry.key.toLowerCase() === param.toLowerCase(),
      );
      return contact ? { name: contact.name } : null;
    },
    resolveLetterByRouteParam: (param) => {
      const letter = ctx.letters.find(
        (entry) =>
          entry.id === param ||
          (entry.number != null && String(entry.number) === param),
      );
      return letter ? { title: letter.title } : null;
    },
    getDocumentByPath: (projectId, relativePath) => {
      const document = ctx.documents.find(
        (entry) =>
          entry.projectId === projectId && entry.path === relativePath,
      );
      return document ? { title: document.title } : null;
    },
    getKnowledgeDocumentByPath: (relativePath) => {
      const document = ctx.documents.find(
        (entry) => entry.projectId == null && entry.path === relativePath,
      );
      return document ? { title: document.title } : null;
    },
  };
}

export async function resolveNavigationSourceClient(
  sourceHref: string,
  ctx: TrailResolveContext,
): Promise<ResolvedNavigationSource | null> {
  return resolveNavigationSourceCore(sourceHref, buildSourceContext(ctx));
}
