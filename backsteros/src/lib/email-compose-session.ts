import { getWarmKeepAliveActiveProductTabId } from "./shell-warm-keep-alive";

const COMPOSE_SESSION_KEY_PREFIX = "backsteros-desktop.email-compose-session";
/** Legacy single-key — migrated/cleared when a tab-scoped session is written. */
const LEGACY_COMPOSE_SESSION_KEY = COMPOSE_SESSION_KEY_PREFIX;

/** One-shot prefill applied when the compose page mounts (e.g. Forward). */
export type EmailComposePrefill = {
  to?: string;
  subject?: string;
  body?: string;
};

export type EmailComposeSession = {
  sessionId: string;
  draftId: string | null;
  inboxId: string | null;
  prefill?: EmailComposePrefill | null;
  /** Product tab that owns this compose session (when known). */
  ownerTabId?: string | null;
};

function storageKeyForTab(tabId: string | null): string {
  if (tabId) return `${COMPOSE_SESSION_KEY_PREFIX}.${tabId}`;
  return LEGACY_COMPOSE_SESSION_KEY;
}

function readRaw(tabId: string | null): EmailComposeSession | null {
  try {
    const keyed = sessionStorage.getItem(storageKeyForTab(tabId));
    if (keyed) {
      return parseSession(keyed);
    }
    // Migrate legacy global once into the active tab slot.
    if (tabId) {
      const legacy = sessionStorage.getItem(LEGACY_COMPOSE_SESSION_KEY);
      if (legacy) {
        const parsed = parseSession(legacy);
        if (parsed) {
          const owned = { ...parsed, ownerTabId: tabId };
          sessionStorage.setItem(storageKeyForTab(tabId), JSON.stringify(owned));
          sessionStorage.removeItem(LEGACY_COMPOSE_SESSION_KEY);
          return owned;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseSession(raw: string): EmailComposeSession | null {
  try {
    const parsed = JSON.parse(raw) as EmailComposeSession;
    if (!parsed.sessionId?.trim()) return null;
    return {
      sessionId: parsed.sessionId.trim(),
      draftId: parsed.draftId?.trim() || null,
      inboxId: parsed.inboxId?.trim() || null,
      prefill: parsed.prefill ?? null,
      ownerTabId: parsed.ownerTabId ?? null,
    };
  } catch {
    return null;
  }
}

function activeTabId(): string | null {
  return getWarmKeepAliveActiveProductTabId();
}

export function readEmailComposeSession(): EmailComposeSession {
  const tabId = activeTabId();
  const existing = readRaw(tabId);
  if (existing) {
    // Stale session from another tab must not drive this tab's compose.
    if (
      existing.ownerTabId &&
      tabId &&
      existing.ownerTabId !== tabId
    ) {
      // Fall through to create a fresh session for this tab.
    } else {
      return existing;
    }
  }
  const sessionId = crypto.randomUUID();
  const next: EmailComposeSession = {
    sessionId,
    draftId: null,
    inboxId: null,
    ownerTabId: tabId,
  };
  writeEmailComposeSession(next);
  return next;
}

export function writeEmailComposeSession(session: EmailComposeSession): void {
  const tabId = activeTabId();
  // Refuse writes that claim a different tab than the active one.
  if (
    session.ownerTabId &&
    tabId &&
    session.ownerTabId !== tabId
  ) {
    return;
  }
  const next: EmailComposeSession = {
    ...session,
    ownerTabId: session.ownerTabId ?? tabId,
  };
  try {
    sessionStorage.setItem(storageKeyForTab(tabId), JSON.stringify(next));
    if (tabId) {
      sessionStorage.removeItem(LEGACY_COMPOSE_SESSION_KEY);
    }
  } catch {
    // Ignore private mode / quota errors.
  }
}

export function resetEmailComposeSession(): void {
  const tabId = activeTabId();
  try {
    sessionStorage.removeItem(storageKeyForTab(tabId));
    if (!tabId) {
      sessionStorage.removeItem(LEGACY_COMPOSE_SESSION_KEY);
    }
  } catch {
    // Ignore private mode / quota errors.
  }
}

/** Test helper — wipe all compose session keys. */
export function resetEmailComposeSessionStorageForTests(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(COMPOSE_SESSION_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
