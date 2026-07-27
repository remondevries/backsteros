import { DocumentOcticon } from "@/components/documents/document-octicon";
import { LetterOcticon } from "@/components/letters/letter-octicon";
import { ProjectOcticon } from "@/components/project-icon";
import {
  getNavigationItemIcon,
  type NavigationItemIconId,
} from "@/components/shell/navigation-item-icon";
import {
  resolveTabIconKind,
  type TabIconKind,
} from "@/lib/tabs/resolve-tab-icon-kind";

/** Map tab kinds onto the shared sidebar navigation icons. */
const TAB_KIND_TO_NAV_ICON: Partial<Record<TabIconKind, NavigationItemIconId>> =
  {
    inbox: "inbox",
    journal: "journal",
    knowledge: "knowledge",
    documents: "knowledge",
    tasks: "tasks",
    projects: "projects",
    project: "projects",
    letters: "letters",
    contacts: "contacts",
    contact: "contacts",
    organizations: "organizations",
    organization: "organizations",
    settings: "settings",
  };

type TabIconProps = {
  href: string;
  icon?: string | null;
  className?: string;
};

function isDocumentDetailTab(
  href: string,
  kind: TabIconKind | null,
  icon?: string | null,
): boolean {
  if (kind === "documents") {
    return (
      /^\/knowledge\/.+/.test(href) ||
      /^\/projects\/[^/]+\/documents\/.+/.test(href)
    );
  }

  // Journal day entries are documents; show a custom icon only when one is set.
  if (kind === "journal") {
    return /^\/journal\/[^/]+$/.test(href) && icon != null;
  }

  return false;
}

function isLetterDetailTab(_href: string, kind: TabIconKind | null): boolean {
  return kind === "letter";
}

function isProjectDetailTab(href: string, kind: TabIconKind | null): boolean {
  return kind === "project" && /^\/projects\/[^/]+$/.test(href);
}

export function TabIcon({
  href,
  icon,
  className = "content-tab-icon",
}: TabIconProps) {
  const kind = resolveTabIconKind(href);
  if (!kind) {
    return null;
  }

  if (isDocumentDetailTab(href, kind, icon)) {
    return (
      <span className={className} aria-hidden="true">
        <DocumentOcticon icon={icon ?? null} size={14} />
      </span>
    );
  }

  if (isLetterDetailTab(href, kind)) {
    return (
      <span className={className} aria-hidden="true">
        <LetterOcticon icon={icon ?? null} size={14} />
      </span>
    );
  }

  if (isProjectDetailTab(href, kind)) {
    return (
      <span className={className} aria-hidden="true">
        <ProjectOcticon icon={icon ?? null} size={14} />
      </span>
    );
  }

  const mapped = TAB_KIND_TO_NAV_ICON[kind];
  const Icon = mapped ? getNavigationItemIcon(mapped) : null;
  if (!Icon) {
    return null;
  }

  return (
    <span className={className} aria-hidden="true">
      <Icon className="size-3.5 shrink-0" />
    </span>
  );
}
