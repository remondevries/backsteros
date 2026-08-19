import { useMemo } from "react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const octicons = require("@primer/octicons") as Record<string, unknown>;

import {
  hasCustomEntityIcon,
  listCustomEntityIconKeys,
} from "../components/custom-entity-icon";
import { hasPrimerOcticon } from "../components/primer-octicon";

/** Habit / entity icon picker emoji set (searchable keywords). */
export const ENTITY_ICON_PICKER_EMOJIS: ReadonlyArray<{
  emoji: string;
  keywords: string[];
}> = [
  { emoji: "💪", keywords: ["muscle", "strong", "gym", "habit"] },
  { emoji: "🏃", keywords: ["run", "running", "exercise"] },
  { emoji: "🚶", keywords: ["walk", "walking"] },
  { emoji: "🧘", keywords: ["meditate", "yoga", "calm"] },
  { emoji: "🚴", keywords: ["bike", "cycle"] },
  { emoji: "🏊", keywords: ["swim", "pool"] },
  { emoji: "🍎", keywords: ["apple", "health", "food"] },
  { emoji: "🥗", keywords: ["salad", "healthy", "food"] },
  { emoji: "💧", keywords: ["water", "hydrate", "drink"] },
  { emoji: "☕", keywords: ["coffee", "drink"] },
  { emoji: "😴", keywords: ["sleep", "rest"] },
  { emoji: "📖", keywords: ["read", "book"] },
  { emoji: "✍️", keywords: ["write", "journal"] },
  { emoji: "📝", keywords: ["note", "memo"] },
  { emoji: "🎯", keywords: ["target", "goal"] },
  { emoji: "✅", keywords: ["check", "done"] },
  { emoji: "⭐", keywords: ["star", "favorite"] },
  { emoji: "🔥", keywords: ["fire", "streak", "hot"] },
  { emoji: "❤️", keywords: ["heart", "love", "health"] },
  { emoji: "🧠", keywords: ["brain", "mind", "focus"] },
  { emoji: "🎵", keywords: ["music"] },
  { emoji: "🎸", keywords: ["guitar", "music"] },
  { emoji: "🎨", keywords: ["art", "create"] },
  { emoji: "📷", keywords: ["photo", "camera"] },
  { emoji: "🧹", keywords: ["clean", "chores"] },
  { emoji: "🧺", keywords: ["laundry", "chores"] },
  { emoji: "🪥", keywords: ["teeth", "brush"] },
  { emoji: "💊", keywords: ["pill", "medicine", "vitamin"] },
  { emoji: "☀️", keywords: ["sun", "morning"] },
  { emoji: "🌙", keywords: ["moon", "night"] },
  { emoji: "🌱", keywords: ["plant", "grow"] },
  { emoji: "🌳", keywords: ["tree", "nature"] },
  { emoji: "🐶", keywords: ["dog", "pet"] },
  { emoji: "🐱", keywords: ["cat", "pet"] },
  { emoji: "🙏", keywords: ["pray", "thanks"] },
  { emoji: "😊", keywords: ["smile", "happy"] },
  { emoji: "🚀", keywords: ["rocket", "launch"] },
  { emoji: "💼", keywords: ["work", "briefcase"] },
  { emoji: "💻", keywords: ["laptop", "code"] },
  { emoji: "📱", keywords: ["phone"] },
  { emoji: "🏠", keywords: ["home", "house"] },
  { emoji: "💰", keywords: ["money", "finance"] },
  { emoji: "📚", keywords: ["books", "study"] },
  { emoji: "🎓", keywords: ["learn", "school"] },
  { emoji: "⏰", keywords: ["alarm", "time"] },
  { emoji: "📅", keywords: ["calendar", "schedule"] },
];

let cachedIconKeys: string[] | null = null;

/** All primer + custom entity icon keys that mobile can render. */
export function listRenderableEntityIconKeys(): string[] {
  if (cachedIconKeys) return cachedIconKeys;
  const primer = Object.keys(octicons).filter(
    (key) => hasPrimerOcticon(key) || hasCustomEntityIcon(key),
  );
  const custom = listCustomEntityIconKeys().filter(
    (key) => !primer.includes(key),
  );
  cachedIconKeys = [...primer, ...custom].sort((a, b) =>
    a.localeCompare(b),
  );
  return cachedIconKeys;
}

export function formatEntityIconKeyLabel(key: string): string {
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function filterEntityIconKeys(
  query: string,
  keys: readonly string[] = listRenderableEntityIconKeys(),
): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...keys];
  return keys.filter((key) => {
    const label = formatEntityIconKeyLabel(key).toLowerCase();
    return key.includes(needle) || label.includes(needle);
  });
}

export function filterEntityIconEmojis(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...ENTITY_ICON_PICKER_EMOJIS];
  return ENTITY_ICON_PICKER_EMOJIS.filter((entry) =>
    entry.keywords.some((word) => word.includes(needle)) ||
    entry.emoji.includes(needle),
  );
}

/** Stable hook-friendly list of icon keys. */
export function useRenderableEntityIconKeys(): string[] {
  return useMemo(() => listRenderableEntityIconKeys(), []);
}
