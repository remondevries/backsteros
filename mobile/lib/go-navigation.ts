/**
 * Desktop-parity Go bindings (G then letter).
 * Letters match `DEFAULT_GO_NAVIGATION_ITEMS` in `@backsteros/ui`.
 */
export type GoNavigationHref =
  | "/inbox"
  | "/journal"
  | "/spaces"
  | "/tasks"
  | "/calendar"
  | "/habits"
  | "/projects"
  | "/catalog"
  | "/letters"
  | "/finance"
  | "/contacts"
  | "/organizations"
  | "/social"
  | "/email";

export type GoNavigationItem = {
  id: string;
  letter: string;
  label: string;
  /** Expo Router path within the signed-in app. */
  href: GoNavigationHref;
};

export const GO_NAVIGATION_ITEMS: readonly GoNavigationItem[] = [
  { id: "inbox", letter: "i", label: "Inbox", href: "/inbox" },
  { id: "journal", letter: "j", label: "Journal", href: "/journal" },
  { id: "knowledge", letter: "s", label: "Spaces", href: "/spaces" },
  { id: "tasks", letter: "t", label: "Tasks", href: "/tasks" },
  { id: "calendar", letter: "a", label: "Agenda", href: "/calendar" },
  { id: "habits", letter: "h", label: "Habit Tracker", href: "/habits" },
  { id: "projects", letter: "p", label: "Projects", href: "/projects" },
  { id: "catalog", letter: "k", label: "Catalog", href: "/catalog" },
  { id: "letters", letter: "l", label: "Letters", href: "/letters" },
  { id: "finance", letter: "f", label: "Finance", href: "/finance" },
  { id: "contacts", letter: "c", label: "Contacts", href: "/contacts" },
  {
    id: "organizations",
    letter: "o",
    label: "Organizations",
    href: "/organizations",
  },
  { id: "social", letter: "n", label: "Network", href: "/social" },
  { id: "email", letter: "e", label: "Email", href: "/email" },
];

export function findGoItemByLetter(
  letter: string,
  items: readonly GoNavigationItem[] = GO_NAVIGATION_ITEMS,
): GoNavigationItem | undefined {
  const normalized = letter.toLowerCase();
  return items.find((item) => item.letter === normalized);
}

/** Normalize expo-key-event / KeyboardEvent.code-style keys to a–z. */
export function keyEventToLetter(key: string, character?: string | null): string | null {
  if (character && /^[a-zA-Z]$/.test(character)) {
    return character.toLowerCase();
  }
  const match = /^Key([A-Za-z])$/.exec(key);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }
  if (/^[a-zA-Z]$/.test(key)) {
    return key.toLowerCase();
  }
  return null;
}
