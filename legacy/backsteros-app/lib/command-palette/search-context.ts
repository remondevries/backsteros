import {
  getActiveContactSection,
  type ContactSectionId,
} from "@/lib/contact-sections";
import {
  getActiveOrganizationSection,
  type OrganizationSectionId,
} from "@/lib/organization-sections";
import { parseOrganizationProjectRoute } from "@/lib/project-route-scope";
import {
  getActiveProjectSection,
  type ProjectSectionId,
} from "@/lib/project-sections";

import type { CommandPaletteFilterMode } from "./types";

export type CommandPaletteSearchContext =
  | { kind: "inbox"; label: "Inbox" }
  | { kind: "tasks"; label: "Tasks" }
  | { kind: "knowledge"; label: "Knowledge Base" }
  | { kind: "letters"; label: "Letters" }
  | { kind: "contacts"; label: "Contacts" }
  | { kind: "organizations"; label: "Organizations" }
  | { kind: "projects"; label: "Projects" | "New project" }
  | {
      kind: "contact";
      /** Route slug (not UUID) until resolved for the API. */
      contactRouteParam: string;
      contactId?: string;
      sectionId: ContactSectionId;
      sectionLabel: string;
      label: string;
    }
  | {
      kind: "organization";
      organizationRouteParam: string;
      organizationId?: string;
      sectionId: OrganizationSectionId;
      sectionLabel: string;
      label: string;
    }
  | {
      kind: "project";
      projectRouteParam: string;
      projectId?: string;
      sectionId: ProjectSectionId;
      sectionLabel: string;
      label: string;
    };

export type CommandPaletteSearchScope = {
  taskProjectId?: string;
  taskContactId?: string;
  taskInboxOnly?: boolean;
  documentProjectId?: string;
  letterProjectId?: string;
  letterContactId?: string;
  letterOrganizationId?: string;
  projectOrganizationId?: string;
  contactOrganizationId?: string;
  includeProjects: boolean;
  includeTasks: boolean;
  includeDocuments: boolean;
  includeLetters: boolean;
  includeKnowledgeDocuments: boolean;
  includeContacts: boolean;
  includeOrganizations: boolean;
};

function sectionLabelFromId(sectionId: string): string {
  return sectionId === "overview"
    ? "Overview"
    : sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
}

export function resolveCommandPaletteSearchContext(
  pathname: string,
  entityNames?: {
    projectName?: string | null;
    contactName?: string | null;
    organizationName?: string | null;
  },
): CommandPaletteSearchContext | null {
  if (pathname.startsWith("/inbox")) {
    return { kind: "inbox", label: "Inbox" };
  }

  if (pathname.startsWith("/tasks")) {
    return { kind: "tasks", label: "Tasks" };
  }

  if (pathname.startsWith("/knowledge")) {
    return { kind: "knowledge", label: "Knowledge Base" };
  }

  if (pathname.startsWith("/letters")) {
    return { kind: "letters", label: "Letters" };
  }

  if (pathname.startsWith("/journal")) {
    return null;
  }

  const orgProject = parseOrganizationProjectRoute(pathname);
  if (orgProject) {
    const { projectRouteParam, organizationRouteParam } = orgProject;
    const sectionId = getActiveProjectSection(pathname, projectRouteParam);
    const sectionLabel = sectionLabelFromId(sectionId);
    const name = entityNames?.projectName?.trim() || "Project";

    return {
      kind: "project",
      projectRouteParam,
      sectionId,
      sectionLabel,
      label: sectionId === "overview" ? name : `${name} · ${sectionLabel}`,
    };
  }

  const contactMatch = pathname.match(/^\/contacts\/([^/]+)/);
  if (contactMatch) {
    const contactRouteParam = decodeURIComponent(contactMatch[1]!);
    const sectionId = getActiveContactSection(pathname, contactRouteParam);

    if (sectionId === "overview") {
      return { kind: "contacts", label: "Contacts" };
    }

    const sectionLabel = sectionLabelFromId(sectionId);
    const name = entityNames?.contactName?.trim() || "Contact";

    return {
      kind: "contact",
      contactRouteParam,
      sectionId,
      sectionLabel,
      label: `${name} · ${sectionLabel}`,
    };
  }

  if (pathname.startsWith("/contacts")) {
    return { kind: "contacts", label: "Contacts" };
  }

  const organizationMatch = pathname.match(/^\/organizations\/([^/]+)/);
  if (organizationMatch) {
    const organizationRouteParam = decodeURIComponent(organizationMatch[1]!);
    const sectionId = getActiveOrganizationSection(
      pathname,
      organizationRouteParam,
    );

    if (sectionId === "overview") {
      return { kind: "organizations", label: "Organizations" };
    }

    // Org-scoped project routes already handled above.
    if (sectionId === "projects" && pathname.includes("/projects/")) {
      // Fall through shouldn't happen after orgProject parse.
    }

    const sectionLabel = sectionLabelFromId(sectionId);
    const name = entityNames?.organizationName?.trim() || "Organization";

    return {
      kind: "organization",
      organizationRouteParam,
      sectionId,
      sectionLabel,
      label: `${name} · ${sectionLabel}`,
    };
  }

  if (pathname.startsWith("/organizations")) {
    return { kind: "organizations", label: "Organizations" };
  }

  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  if (!projectMatch) {
    if (pathname.startsWith("/projects")) {
      return { kind: "projects", label: "Projects" };
    }

    return null;
  }

  const projectRouteParam = decodeURIComponent(projectMatch[1]!);
  if (projectRouteParam === "new") {
    return { kind: "projects", label: "New project" };
  }

  const sectionId = getActiveProjectSection(pathname, projectRouteParam);
  const sectionLabel = sectionLabelFromId(sectionId);
  const name = entityNames?.projectName?.trim() || "Project";

  return {
    kind: "project",
    projectRouteParam,
    sectionId,
    sectionLabel,
    label: sectionId === "overview" ? name : `${name} · ${sectionLabel}`,
  };
}

export function resolveContextSearchScope(
  context: CommandPaletteSearchContext | null,
): CommandPaletteSearchScope | null {
  if (!context) {
    return null;
  }

  const emptyScope = {
    includeProjects: false,
    includeTasks: false,
    includeDocuments: false,
    includeLetters: false,
    includeKnowledgeDocuments: false,
    includeContacts: false,
    includeOrganizations: false,
  };

  switch (context.kind) {
    case "inbox":
      return { ...emptyScope, taskInboxOnly: true, includeTasks: true };
    case "tasks":
      return { ...emptyScope, includeTasks: true };
    case "knowledge":
      return { ...emptyScope, includeKnowledgeDocuments: true };
    case "letters":
      return { ...emptyScope, includeLetters: true };
    case "contacts":
      return { ...emptyScope, includeContacts: true };
    case "organizations":
      return { ...emptyScope, includeOrganizations: true };
    case "projects":
      return { ...emptyScope, includeProjects: true };
    case "contact": {
      const contactId = context.contactId;
      if (!contactId) return { ...emptyScope, includeContacts: true };

      switch (context.sectionId) {
        case "tasks":
          return {
            ...emptyScope,
            taskContactId: contactId,
            includeTasks: true,
          };
        case "letters":
          return {
            ...emptyScope,
            letterContactId: contactId,
            includeLetters: true,
          };
        default:
          return {
            ...emptyScope,
            taskContactId: contactId,
            letterContactId: contactId,
            includeTasks: true,
            includeLetters: true,
          };
      }
    }
    case "organization": {
      const organizationId = context.organizationId;
      if (!organizationId) {
        return { ...emptyScope, includeOrganizations: true };
      }

      switch (context.sectionId) {
        case "projects":
          return {
            ...emptyScope,
            projectOrganizationId: organizationId,
            includeProjects: true,
          };
        case "contacts":
          return {
            ...emptyScope,
            contactOrganizationId: organizationId,
            includeContacts: true,
          };
        case "letters":
          return {
            ...emptyScope,
            letterOrganizationId: organizationId,
            includeLetters: true,
          };
        default:
          return {
            ...emptyScope,
            projectOrganizationId: organizationId,
            contactOrganizationId: organizationId,
            letterOrganizationId: organizationId,
            includeProjects: true,
            includeContacts: true,
            includeLetters: true,
          };
      }
    }
    case "project": {
      const projectId = context.projectId;
      if (!projectId) return { ...emptyScope, includeProjects: true };

      switch (context.sectionId) {
        case "documents":
          return {
            ...emptyScope,
            documentProjectId: projectId,
            includeDocuments: true,
          };
        case "tasks":
          return {
            ...emptyScope,
            taskProjectId: projectId,
            includeTasks: true,
          };
        case "letters":
          return {
            ...emptyScope,
            letterProjectId: projectId,
            includeLetters: true,
          };
        default:
          return {
            ...emptyScope,
            taskProjectId: projectId,
            documentProjectId: projectId,
            letterProjectId: projectId,
            includeTasks: true,
            includeDocuments: true,
            includeLetters: true,
          };
      }
    }
  }
}

export function appendCommandPaletteSearchParams(
  params: URLSearchParams,
  options: {
    mode: CommandPaletteFilterMode;
    context: CommandPaletteSearchContext | null;
  },
): void {
  if (options.mode !== "all") {
    params.set("mode", options.mode);
    return;
  }

  const context = options.context;
  if (!context) return;

  params.set("contextKind", context.kind);

  if (context.kind === "project" && context.projectId) {
    params.set("projectId", context.projectId);
    params.set("projectSection", context.sectionId);
  }

  if (context.kind === "contact" && context.contactId) {
    params.set("contactId", context.contactId);
    params.set("contactSection", context.sectionId);
  }

  if (context.kind === "organization" && context.organizationId) {
    params.set("organizationId", context.organizationId);
    params.set("organizationSection", context.sectionId);
  }
}

export function filterModeToApiMode(
  mode: CommandPaletteFilterMode,
): string {
  return mode;
}
