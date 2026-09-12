export const routeFamilies = [
  "projects",
  "development",
  "areas",
  "tasks",
  "calendar",
  "inbox",
  "email",
  "communication",
  "social",
  "contacts",
  "organizations",
  "knowledge",
  "journal",
  "letters",
  "finance",
  "settings",
] as const;

export type RouteFamily = (typeof routeFamilies)[number];

export type NavigationItemIconId =
  | "inbox"
  | "email"
  | "journal"
  | "habits"
  | "tasks"
  | "calendar"
  | "areas"
  | "projects"
  | "development"
  | "knowledge"
  | "letters"
  | "finance"
  | "communication"
  | "social"
  | "organizations"
  | "contacts"
  | "settings";

export type NavigationSectionId = "primary" | "workspace" | "people" | "system";

export type NavigationItem = {
  href: `/${string}`;
  label: string;
  icon: NavigationItemIconId;
  section: NavigationSectionId;
};

export const navigation: NavigationItem[] = [
  { href: "/inbox", label: "Inbox", icon: "inbox", section: "primary" },
  { href: "/journal", label: "Journal", icon: "journal", section: "primary" },
  {
    href: "/calendar",
    label: "Calendar",
    icon: "calendar",
    section: "primary",
  },
  {
    href: "/journal/habits",
    label: "Habit Tracker",
    icon: "habits",
    section: "primary",
  },
  { href: "/tasks", label: "Tasks", icon: "tasks", section: "workspace" },
  { href: "/areas", label: "Areas", icon: "areas", section: "workspace" },
  {
    href: "/projects",
    label: "Projects",
    icon: "projects",
    section: "workspace",
  },
  {
    href: "/development",
    label: "Development",
    icon: "development",
    section: "workspace",
  },
  {
    href: "/knowledge",
    label: "Knowledge Base",
    icon: "knowledge",
    section: "workspace",
  },
  {
    href: "/letters",
    label: "Letters",
    icon: "letters",
    section: "workspace",
  },
  { href: "/finance", label: "Finance", icon: "finance", section: "workspace" },
  {
    href: "/communication",
    label: "Communication",
    icon: "communication",
    section: "people",
  },
  { href: "/social", label: "Social", icon: "social", section: "people" },
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
  development: {
    title: "Development",
    description: "Codebases and engineering work",
    singular: "development",
    accent: "#5b8def",
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
  calendar: {
    title: "Calendar",
    description: "Tasks scheduled across your week",
    singular: "task",
    accent: "#5b8def",
  },
  inbox: {
    title: "Inbox",
    description: "Capture now and organize later",
    singular: "inbox item",
    accent: "#b68cff",
  },
  email: {
    title: "Email",
    description: "Incoming mail from connected inboxes",
    singular: "message",
    accent: "#6aa4e8",
  },
  communication: {
    title: "Communication",
    description: "Support tickets and email with clients",
    singular: "conversation",
    accent: "#5b9fd6",
  },
  social: {
    title: "Social",
    description: "Social accounts and activity",
    singular: "social",
    accent: "#8b7cf6",
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
  finance: {
    title: "Finance",
    description: "Bank accounts and transactions",
    singular: "bank account",
    accent: "#4cae8a",
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
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) return false;
  return !navigation.some(
    (item) =>
      item.href !== href &&
      item.href.startsWith(`${href}/`) &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
}

export function titleForPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const family = isRouteFamily(segments[0]) ? segments[0] : "projects";
  if (segments.length > 1) {
    return `${routeCopy[family].singular[0]!.toUpperCase()}${routeCopy[family].singular.slice(1)}`;
  }
  return routeCopy[family].title;
}
