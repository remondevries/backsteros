/**
 * Local “seen” cursor for shell agent DM notifications.
 * Keyed by chat thread id → last assistant message id the user opened/dismissed.
 */

const STORAGE_KEY = "backsteros:agent-dm-seen-v1";
const BOOTSTRAP_KEY = "backsteros:agent-dm-seen-bootstrapped-v1";

export const AGENT_DM_SEEN_CHANGED_EVENT = "backsteros:agent-dm-seen-changed";

type SeenMap = Record<string, string>;

function readMap(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: SeenMap = {};
    for (const [threadId, messageId] of Object.entries(parsed)) {
      if (typeof messageId === "string" && messageId.trim()) {
        out[threadId] = messageId;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: SeenMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(AGENT_DM_SEEN_CHANGED_EVENT));
}

export function getAgentDmSeenMessageId(threadId: string): string | null {
  const id = readMap()[threadId];
  return id ?? null;
}

export function isAgentDmMessageUnseen(
  threadId: string,
  messageId: string,
): boolean {
  const seen = getAgentDmSeenMessageId(threadId);
  return seen !== messageId;
}

export function markAgentDmSeen(threadId: string, messageId: string): void {
  const trimmedThread = threadId.trim();
  const trimmedMessage = messageId.trim();
  if (!trimmedThread || !trimmedMessage) return;
  const map = readMap();
  if (map[trimmedThread] === trimmedMessage) return;
  map[trimmedThread] = trimmedMessage;
  writeMap(map);
}

/**
 * First-run: treat currently known assistant messages as already seen so
 * shipping this feature doesn’t dump every historical reply into the banner.
 * Later replies still notify.
 */
export function bootstrapAgentDmSeenIfNeeded(
  entries: ReadonlyArray<{ threadId: string; messageId: string }>,
): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(BOOTSTRAP_KEY) === "1") return;
  const map = readMap();
  for (const entry of entries) {
    const threadId = entry.threadId.trim();
    const messageId = entry.messageId.trim();
    if (!threadId || !messageId) continue;
    map[threadId] = messageId;
  }
  writeMap(map);
  window.localStorage.setItem(BOOTSTRAP_KEY, "1");
}
