import { formatJournalEntryTitle } from "@/lib/journal/dates";
import {
  getTasksDueFilterLabel,
  getTasksDueListHref,
  isTasksDueFilter,
  parseTasksDueFilter,
} from "@/lib/tasks-due-filters";

import type { ResolvedNavigationSource } from "./source-types";

export const NAVIGATION_SOURCE_SECTION_LABELS: Record<string, string> = {
  inbox: "Inbox",
  journal: "Journal",
  knowledge: "Knowledge Base",
  tasks: "Tasks",
  projects: "Projects",
  letters: "Letters",
  contacts: "Contacts",
  organizations: "Organizations",
};

export type NavigationSourceContext = {
  taskLabel(routeParam: string): string | null | Promise<string | null>;
  resolveOrganizationByRouteParam(
    param: string,
  ): { name: string } | null | Promise<{ name: string } | null>;
  resolveProjectByRouteParam(
    param: string,
  ): { id: string; name: string } | null | Promise<{ id: string; name: string } | null>;
  resolveContactByRouteParam(
    param: string,
  ): { name: string } | null | Promise<{ name: string } | null>;
  resolveLetterByRouteParam(
    param: string,
  ): { title: string } | null | Promise<{ title: string } | null>;
  getDocumentByPath(
    projectId: string,
    relativePath: string,
  ): { title: string } | null | Promise<{ title: string } | null>;
  getKnowledgeDocumentByPath(
    relativePath: string,
  ): { title: string } | null | Promise<{ title: string } | null>;
};

function decodePath(value: string): string | null {
  try {
    return value
      .split("/")
      .map(decodeURIComponent)
      .join("/");
  } catch {
    return null;
  }
}

export async function resolveNavigationSourceCore(
  sourceHref: string,
  ctx: NavigationSourceContext,
): Promise<ResolvedNavigationSource | null> {

  const pathname = sourceHref.split(/[?#]/)[0] ?? "/";
  const section = pathname.split("/")[1] ?? "";
  const sectionLabel = NAVIGATION_SOURCE_SECTION_LABELS[section];
  if (!sectionLabel) {
    return null;
  }
  const base: Omit<ResolvedNavigationSource, "items"> = {
    sectionLabel,
    sectionHref: `/${section}`,
  };

  const orgProjectChild = pathname.match(
    /^\/organizations\/([^/]+)\/projects\/([^/]+)\/(tasks|letters)\/([^/]+)$/,
  );
  if (orgProjectChild) {
    const organization = await ctx.resolveOrganizationByRouteParam(orgProjectChild[1]!);
    const project = await ctx.resolveProjectByRouteParam(orgProjectChild[2]!);
    const childLabel =
      orgProjectChild[3] === "tasks"
        ? await ctx.taskLabel(orgProjectChild[4]!)
        : (await ctx.resolveLetterByRouteParam(orgProjectChild[4]!))?.title;
    if (!organization || !project || !childLabel) {
      return null;
    }
    const orgHref = `/organizations/${orgProjectChild[1]}`;
    const projectHref = `${orgHref}/projects/${orgProjectChild[2]}`;
    return {
      ...base,
      items: [
        { label: organization.name, href: `${orgHref}/projects` },
        {
          label: project.name,
          href: `${projectHref}/${orgProjectChild[3]}`,
        },
        { label: childLabel, href: sourceHref },
      ],
    };
  }

  const orgContactChild = pathname.match(
    /^\/organizations\/([^/]+)\/contacts\/([^/]+)\/(tasks|letters)\/([^/]+)$/,
  );
  if (orgContactChild) {
    const organization = await ctx.resolveOrganizationByRouteParam(orgContactChild[1]!);
    const contact = await ctx.resolveContactByRouteParam(orgContactChild[2]!);
    const childLabel =
      orgContactChild[3] === "tasks"
        ? await ctx.taskLabel(orgContactChild[4]!)
        : (await ctx.resolveLetterByRouteParam(orgContactChild[4]!))?.title;
    if (!organization || !contact || !childLabel) {
      return null;
    }
    const orgHref = `/organizations/${orgContactChild[1]}`;
    const contactHref = `${orgHref}/contacts/${orgContactChild[2]}`;
    return {
      ...base,
      items: [
        { label: organization.name, href: `${orgHref}/contacts` },
        {
          label: contact.name,
          href: `${contactHref}/${orgContactChild[3]}`,
        },
        { label: childLabel, href: sourceHref },
      ],
    };
  }

  const organizationLetter = pathname.match(
    /^\/organizations\/([^/]+)\/letters\/([^/]+)$/,
  );
  if (organizationLetter) {
    const organization = await ctx.resolveOrganizationByRouteParam(organizationLetter[1]!);
    const letter = await ctx.resolveLetterByRouteParam(organizationLetter[2]!);
    if (!organization || !letter) {
      return null;
    }
    return {
      ...base,
      items: [
        {
          label: organization.name,
          href: `/organizations/${organizationLetter[1]}/letters`,
        },
        { label: letter.title, href: sourceHref },
      ],
    };
  }

  const orgProjectDocument = pathname.match(
    /^\/organizations\/([^/]+)\/projects\/([^/]+)\/documents\/(.+)$/,
  );
  if (orgProjectDocument) {
    const organization = await ctx.resolveOrganizationByRouteParam(orgProjectDocument[1]!);
    const project = await ctx.resolveProjectByRouteParam(orgProjectDocument[2]!);
    const relativePath = decodePath(orgProjectDocument[3]!);
    const document =
      project && relativePath
        ? await ctx.getDocumentByPath(project.id, relativePath)
        : undefined;
    if (!organization || !project || !document) {
      return null;
    }
    const orgHref = `/organizations/${orgProjectDocument[1]}`;
    const projectHref = `${orgHref}/projects/${orgProjectDocument[2]}`;
    return {
      ...base,
      items: [
        { label: organization.name, href: `${orgHref}/projects` },
        { label: project.name, href: projectHref },
        { label: document.title, href: sourceHref },
      ],
    };
  }

  const projectDocument = pathname.match(
    /^\/projects\/([^/]+)\/documents\/(.+)$/,
  );
  if (projectDocument) {
    const project = await ctx.resolveProjectByRouteParam(projectDocument[1]!);
    const relativePath = decodePath(projectDocument[2]!);
    const document =
      project && relativePath
        ? await ctx.getDocumentByPath(project.id, relativePath)
        : undefined;
    if (!project || !document) {
      return null;
    }
    return {
      ...base,
      items: [
        { label: project.name, href: `/projects/${projectDocument[1]}` },
        { label: document.title, href: sourceHref },
      ],
    };
  }

  const orgProject = pathname.match(
    /^\/organizations\/([^/]+)\/projects\/([^/]+)(?:\/.*)?$/,
  );
  if (orgProject) {
    const organization = await ctx.resolveOrganizationByRouteParam(orgProject[1]!);
    const project = await ctx.resolveProjectByRouteParam(orgProject[2]!);
    if (!organization || !project) {
      return null;
    }
    return {
      ...base,
      items: [
        {
          label: organization.name,
          href: `/organizations/${orgProject[1]}/projects`,
        },
        { label: project.name, href: sourceHref },
      ],
    };
  }

  const orgContact = pathname.match(
    /^\/organizations\/([^/]+)\/contacts\/([^/]+)(?:\/.*)?$/,
  );
  if (orgContact) {
    const organization = await ctx.resolveOrganizationByRouteParam(orgContact[1]!);
    const contact = await ctx.resolveContactByRouteParam(orgContact[2]!);
    if (!organization || !contact) {
      return null;
    }
    return {
      ...base,
      items: [
        {
          label: organization.name,
          href: `/organizations/${orgContact[1]}/contacts`,
        },
        { label: contact.name, href: sourceHref },
      ],
    };
  }

  const projectTask = pathname.match(
    /^\/projects\/([^/]+)\/tasks\/([^/]+)$/,
  );
  if (projectTask) {
    const project = await ctx.resolveProjectByRouteParam(projectTask[1]!);
    const label = await ctx.taskLabel(projectTask[2]!);
    if (!project || !label) {
      return null;
    }
    return {
      ...base,
      items: [
        { label: project.name, href: `/projects/${projectTask[1]}/tasks` },
        { label, href: sourceHref },
      ],
    };
  }

  const contactTask = pathname.match(
    /^\/contacts\/([^/]+)\/tasks\/([^/]+)$/,
  );
  if (contactTask) {
    const contact = await ctx.resolveContactByRouteParam(contactTask[1]!);
    const label = await ctx.taskLabel(contactTask[2]!);
    if (!contact || !label) {
      return null;
    }
    return {
      ...base,
      items: [
        { label: contact.name, href: `/contacts/${contactTask[1]}/tasks` },
        { label, href: sourceHref },
      ],
    };
  }

  const projectLetter = pathname.match(
    /^\/projects\/([^/]+)\/letters\/([^/]+)$/,
  );
  if (projectLetter) {
    const project = await ctx.resolveProjectByRouteParam(projectLetter[1]!);
    const letter = await ctx.resolveLetterByRouteParam(projectLetter[2]!);
    if (!project || !letter) {
      return null;
    }
    return {
      ...base,
      items: [
        { label: project.name, href: `/projects/${projectLetter[1]}/letters` },
        { label: letter.title, href: sourceHref },
      ],
    };
  }

  const contactLetter = pathname.match(
    /^\/contacts\/([^/]+)\/letters\/([^/]+)$/,
  );
  if (contactLetter) {
    const contact = await ctx.resolveContactByRouteParam(contactLetter[1]!);
    const letter = await ctx.resolveLetterByRouteParam(contactLetter[2]!);
    if (!contact || !letter) {
      return null;
    }
    return {
      ...base,
      items: [
        { label: contact.name, href: `/contacts/${contactLetter[1]}/letters` },
        { label: letter.title, href: sourceHref },
      ],
    };
  }

  const dueTask = pathname.match(/^\/tasks\/([^/]+)\/([^/]+)$/);
  if (dueTask) {
    const label = await ctx.taskLabel(dueTask[2]!);
    const dueFilter = isTasksDueFilter(dueTask[1]!)
      ? parseTasksDueFilter(dueTask[1])
      : null;
    return label
      ? {
          ...base,
          items: [
            {
              label: dueFilter ? getTasksDueFilterLabel(dueFilter) : dueTask[1]!,
              href: dueFilter ? getTasksDueListHref(dueFilter) : "/tasks",
            },
            { label, href: sourceHref },
          ],
        }
      : null;
  }

  const knowledge = pathname.match(/^\/knowledge\/(.+)$/);
  if (knowledge) {
    const relativePath = decodePath(knowledge[1]!);
    const document = relativePath
      ? await ctx.getKnowledgeDocumentByPath(relativePath)
      : undefined;
    if (!document) {
      return null;
    }
    return { ...base, items: [{ label: document.title, href: sourceHref }] };
  }

  const journal = pathname.match(/^\/journal\/([^/]+)$/);
  if (journal) {
    return {
      ...base,
      items: [
        { label: formatJournalEntryTitle(journal[1]!), href: sourceHref },
      ],
    };
  }

  const letter = pathname.match(/^\/letters\/([^/]+)$/);
  if (letter) {
    const resolved = await ctx.resolveLetterByRouteParam(letter[1]!);
    if (!resolved) {
      return null;
    }
    return { ...base, items: [{ label: resolved.title, href: sourceHref }] };
  }

  const inboxItem = pathname.match(/^\/inbox\/([^/]+)$/);
  if (inboxItem) {
    const label =
      await ctx.taskLabel(inboxItem[1]!) ??
      (await ctx.resolveLetterByRouteParam(inboxItem[1]!))?.title ??
      null;
    return label
      ? { ...base, items: [{ label, href: sourceHref }] }
      : null;
  }

  const project = pathname.match(/^\/projects\/([^/]+)(?:\/.*)?$/);
  if (project) {
    const resolved = await ctx.resolveProjectByRouteParam(project[1]!);
    return resolved
      ? { ...base, items: [{ label: resolved.name, href: sourceHref }] }
      : null;
  }

  const contact = pathname.match(/^\/contacts\/([^/]+)(?:\/.*)?$/);
  if (contact) {
    const resolved = await ctx.resolveContactByRouteParam(contact[1]!);
    return resolved
      ? { ...base, items: [{ label: resolved.name, href: sourceHref }] }
      : null;
  }

  const organization = pathname.match(/^\/organizations\/([^/]+)(?:\/.*)?$/);
  if (organization) {
    const resolved = await ctx.resolveOrganizationByRouteParam(organization[1]!);
    return resolved
      ? { ...base, items: [{ label: resolved.name, href: sourceHref }] }
      : null;
  }

  return { ...base, items: [] };
}
