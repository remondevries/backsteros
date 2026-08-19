const COMPOSE_SESSION_KEY = "backsteros-desktop.email-compose-session";

export type EmailComposeSession = {
  sessionId: string;
  draftId: string | null;
  inboxId: string | null;
};

function readRaw(): EmailComposeSession | null {
  try {
    const raw = sessionStorage.getItem(COMPOSE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EmailComposeSession;
    if (!parsed.sessionId?.trim()) return null;
    return {
      sessionId: parsed.sessionId.trim(),
      draftId: parsed.draftId?.trim() || null,
      inboxId: parsed.inboxId?.trim() || null,
    };
  } catch {
    return null;
  }
}

export function readEmailComposeSession(): EmailComposeSession {
  const existing = readRaw();
  if (existing) return existing;
  const sessionId = crypto.randomUUID();
  const next: EmailComposeSession = {
    sessionId,
    draftId: null,
    inboxId: null,
  };
  writeEmailComposeSession(next);
  return next;
}

export function writeEmailComposeSession(session: EmailComposeSession): void {
  try {
    sessionStorage.setItem(COMPOSE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore private mode / quota errors.
  }
}

export function resetEmailComposeSession(): void {
  try {
    sessionStorage.removeItem(COMPOSE_SESSION_KEY);
  } catch {
    // Ignore private mode / quota errors.
  }
}
