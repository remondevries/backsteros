export const routeFamilies = [
  "projects",
  "areas",
  "tasks",
  "inbox",
  "contacts",
  "organizations",
  "knowledge",
  "journal",
  "letters",
  "settings",
] as const;

export type RouteFamily = (typeof routeFamilies)[number];

export type NavigationItemIconId =
  | "inbox"
  | "journal"
  | "tasks"
  | "projects"
  | "knowledge"
  | "letters"
  | "organizations"
  | "contacts"
  | "settings";

export type NavigationSectionId = "primary" | "workspace" | "people" | "system";

export type NavigationItem = {
  href: `/${RouteFamily}`;
  label: string;
  icon: NavigationItemIconId;
  section: NavigationSectionId;
};

export const navigation: NavigationItem[] = [
  { href: "/inbox", label: "Inbox", icon: "inbox", section: "primary" },
  { href: "/journal", label: "Journal", icon: "journal", section: "primary" },
  { href: "/tasks", label: "Tasks", icon: "tasks", section: "workspace" },
  {
    href: "/projects",
    label: "Projects",
    icon: "projects",
    section: "workspace",
  },
  {
    href: "/knowledge",
    label: "Knowledge Base",
    icon: "knowledge",
    section: "workspace",
  },
  { href: "/letters", label: "Letters", icon: "letters", section: "workspace" },
  { href: "/contacts", label: "Contacts", icon: "contacts", section: "people" },
  {
    href: "/organizations",
    label: "Organizations",
    icon: "organizations",
    section: "people",
  },
  { href: "/settings", label: "Settings", icon: "settings", section: "system" },
];

export const navigationSections = [
  { id: "primary", label: "" },
  { id: "workspace", label: "Workspace" },
  { id: "people", label: "People" },
] as const;

export const routeCopy: Record<
  RouteFamily,
  { title: string; description: string; singular: string; accent: string }
> = {
  projects: {
    title: "Projects",
    description: "Active work across your workspace",
    singular: "project",
    accent: "#ee7a47",
  },
  areas: {
    title: "Areas",
    description: "Long-running responsibilities and focus",
    singular: "area",
    accent: "#ee9f47",
  },
  tasks: {
    title: "Tasks",
    description: "Your open work, ordered by priority",
    singular: "task",
    accent: "#7c9cff",
  },
  inbox: {
    title: "Inbox",
    description: "Capture now and organize later",
    singular: "inbox item",
    accent: "#b68cff",
  },
  contacts: {
    title: "Contacts",
    description: "People connected to your work",
    singular: "contact",
    accent: "#5bbad5",
  },
  organizations: {
    title: "Organizations",
    description: "Clients, partners, and teams",
    singular: "organization",
    accent: "#d6a85b",
  },
  knowledge: {
    title: "Knowledge Base",
    description: "Documents and reference material",
    singular: "document",
    accent: "#62b98c",
  },
  journal: {
    title: "Journal",
    description: "Daily notes and reflections",
    singular: "entry",
    accent: "#df728b",
  },
  letters: {
    title: "Letters",
    description: "Correspondence and generated PDFs",
    singular: "letter",
    accent: "#8d9dad",
  },
  settings: {
    title: "Settings",
    description: "Workspace and account preferences",
    singular: "setting",
    accent: "#929292",
  },
};

export function isRouteFamily(value: string | undefined): value is RouteFamily {
  return routeFamilies.includes(value as RouteFamily);
}

export function isNavigationPathActive(
  pathname: string,
  href: string,
): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function titleForPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const family = isRouteFamily(segments[0]) ? segments[0] : "projects";
  if (segments.length > 1) {
    return `${routeCopy[family].singular[0]!.toUpperCase()}${routeCopy[family].singular.slice(1)}`;
  }
  return routeCopy[family].title;
}
