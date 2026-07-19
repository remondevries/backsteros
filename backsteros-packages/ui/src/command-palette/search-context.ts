import {
  getActiveContactSection,
  type ContactSectionId,
} from "../contact-sections.js";
import {
  getActiveOrganizationSection,
  type OrganizationSectionId,
} from "../organization-sections.js";
import { parseOrganizationProjectRoute } from "../project-route-scope.js";
import {
  getActiveProjectSection,
  type ProjectSectionId,
} from "../project-sections.js";
import type { CommandPaletteFilterMode } from "../command-palette.js";

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
    const { projectRouteParam } = orgProject;
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
