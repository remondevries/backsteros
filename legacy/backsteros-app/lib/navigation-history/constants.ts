export const NAVIGATION_HISTORY_STORAGE_KEY = "backsteros.navigation-history";

/** Removed storage keys from earlier navigation experiments; cleared once on app load. */
export const LEGACY_NAVIGATION_STORAGE_KEYS = [
  "backsteros:navigation-history",
] as const;

export const NAVIGATION_HISTORY_MAX_ENTRIES = 50;

export const NAVIGATION_HISTORY_RECENT_LIMIT = 12;
