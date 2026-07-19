import {
  isScopedFilterMode,
  type CommandPaletteFilterMode,
} from "../command-palette.js";
import type { CommandPaletteSearchContext } from "./search-context.js";

const FILTER_BREADCRUMB_LABELS: Record<
  Exclude<CommandPaletteFilterMode, "all">,
  string
> = {
  projects: "Projects",
  tasks: "Tasks",
  documents: "Documents",
  letters: "Letters",
  knowledge: "Knowledge",
  contacts: "Contacts",
  organizations: "Organizations",
};

function entityNameFromContext(context: CommandPaletteSearchContext): string {
  if (
    context.kind === "project" ||
    context.kind === "contact" ||
    context.kind === "organization"
  ) {
    const [name] = context.label.split(" · ");
    return name?.trim() || context.label;
  }

  return context.label;
}

function breadcrumbFromRouteContext(
  context: CommandPaletteSearchContext,
): string[] {
  switch (context.kind) {
    case "project": {
      const name = entityNameFromContext(context);
      if (context.sectionId === "overview") {
        return ["Projects", name];
      }
      return ["Projects", name, context.sectionLabel];
    }
    case "contact": {
      const name = entityNameFromContext(context);
      if (context.sectionId === "overview") {
        return ["Contacts", name];
      }
      return ["Contacts", name, context.sectionLabel];
    }
    case "organization": {
      const name = entityNameFromContext(context);
      if (context.sectionId === "overview") {
        return ["Organizations", name];
      }
      return ["Organizations", name, context.sectionLabel];
    }
    default:
      return [context.label];
  }
}

export function buildCommandPaletteContextBreadcrumb({
  filterMode,
  manualContext,
  routeContext,
  contextDismissed,
}: {
  filterMode: CommandPaletteFilterMode;
  manualContext: CommandPaletteSearchContext | null;
  routeContext: CommandPaletteSearchContext | null;
  contextDismissed: boolean;
}): string[] {
  if (isScopedFilterMode(filterMode)) {
    return [FILTER_BREADCRUMB_LABELS[filterMode]];
  }

  if (manualContext) {
    return breadcrumbFromRouteContext(manualContext);
  }

  if (routeContext && !contextDismissed && filterMode === "all") {
    return breadcrumbFromRouteContext(routeContext);
  }

  return [];
}

export function peelRouteSearchContext(
  context: CommandPaletteSearchContext,
): CommandPaletteSearchContext | null {
  switch (context.kind) {
    case "project":
    case "contact":
    case "organization": {
      if (context.sectionId !== "overview") {
        const name = entityNameFromContext(context);
        return {
          ...context,
          sectionId: "overview",
          sectionLabel: "Overview",
          label: name,
        };
      }

      if (context.kind === "project") {
        return { kind: "projects", label: "Projects" };
      }

      if (context.kind === "contact") {
        return { kind: "contacts", label: "Contacts" };
      }

      return { kind: "organizations", label: "Organizations" };
    }
    default:
      return null;
  }
}
