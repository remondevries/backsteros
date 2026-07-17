export type NavigationShortcutId =
  | "inbox"
  | "journal"
  | "knowledge"
  | "tasks"
  | "projects"
  | "letters"
  | "contacts"
  | "organizations";

export type NavigationShortcutBinding = {
  id: NavigationShortcutId;
  letter: string;
  hint: string;
  label: string;
  href: string;
};

export const NAVIGATION_LEADER_SHORTCUTS: NavigationShortcutBinding[] = [
  {
    id: "inbox",
    letter: "i",
    hint: "G I",
    label: "Inbox",
    href: "/inbox",
  },
  {
    id: "journal",
    letter: "j",
    hint: "G J",
    label: "Journal",
    href: "/journal",
  },
  {
    id: "knowledge",
    letter: "k",
    hint: "G K",
    label: "Knowledge Base",
    href: "/knowledge",
  },
  {
    id: "tasks",
    letter: "t",
    hint: "G T",
    label: "Tasks",
    href: "/tasks",
  },
  {
    id: "projects",
    letter: "p",
    hint: "G P",
    label: "Projects",
    href: "/projects",
  },
  {
    id: "letters",
    letter: "l",
    hint: "G L",
    label: "Letters",
    href: "/letters",
  },
  {
    id: "contacts",
    letter: "c",
    hint: "G C",
    label: "Contacts",
    href: "/contacts",
  },
  {
    id: "organizations",
    letter: "o",
    hint: "G O",
    label: "Organizations",
    href: "/organizations",
  },
];

const NAVIGATION_SHORTCUT_HINTS = Object.fromEntries(
  NAVIGATION_LEADER_SHORTCUTS.map((binding) => [binding.id, binding.hint]),
) as Record<NavigationShortcutId, string>;

export function navigationShortcutHint(
  navItemId: string,
): string | undefined {
  return NAVIGATION_SHORTCUT_HINTS[navItemId as NavigationShortcutId];
}

export function findNavigationShortcutByLetter(
  letter: string,
): NavigationShortcutBinding | undefined {
  return NAVIGATION_LEADER_SHORTCUTS.find(
    (binding) => binding.letter === letter,
  );
}

export const NAVIGATION_GO_LETTER_HINT = NAVIGATION_LEADER_SHORTCUTS.map(
  (binding) => binding.letter,
).join(" ");
