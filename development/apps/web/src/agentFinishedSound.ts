/**
 * Play a short chime when an agent turn finishes.
 * Uses a singleton HTMLAudioElement so overlapping finishes don't stack.
 * Suppressed while the user already has that chat in focus.
 *
 * BacksterOS task chats defer the chime to the agent→in_review promotion
 * (see promoteWorkingTask) so the sound lines up with the status the user
 * watches for — and still plays when they are not looking at the UI.
 */

const AGENT_FINISHED_SOUND_URL = "/sounds/agent-finished.mp3";
/** Cover the BacksterOS leave-grace window so finish + in_review don't double-chime. */
const RECENT_PLAY_TTL_MS = 20_000;

let audio: HTMLAudioElement | null = null;
let unlocked = false;
const recentPlayByThreadKey = new Map<string, number>();

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio(AGENT_FINISHED_SOUND_URL);
    audio.preload = "auto";
  }
  return audio;
}

/** True when the app window/tab is visible and focused. */
export function isAppDocumentFocused(
  doc: Pick<Document, "visibilityState" | "hasFocus"> = document,
): boolean {
  return doc.visibilityState === "visible" && doc.hasFocus();
}

/**
 * Play only when the user is not already focused on the chat that finished.
 * Window blurred / hidden tab → play. Viewing that thread with focus → skip.
 * Viewing a different thread (or no chat) with focus → play.
 */
export function shouldPlayAgentFinishedSound(input: {
  finishedThreadKey: string;
  activeThreadKey: string | null;
  doc?: Pick<Document, "visibilityState" | "hasFocus">;
}): boolean {
  const doc = input.doc ?? document;
  if (!isAppDocumentFocused(doc)) return true;
  return input.activeThreadKey !== input.finishedThreadKey;
}

/** Call from a user gesture so browsers allow later programmatic play. */
export function unlockAgentFinishedSound(): void {
  const el = getAudio();
  if (!el || unlocked) return;
  unlocked = true;
  const previousVolume = el.volume;
  el.volume = 0;
  void el
    .play()
    .then(() => {
      el.pause();
      el.currentTime = 0;
      el.volume = previousVolume;
    })
    .catch(() => {
      unlocked = false;
    });
}

export function playAgentFinishedSound(): void {
  const el = getAudio();
  if (!el) return;
  try {
    el.currentTime = 0;
    void el.play().catch(() => {
      // Autoplay blocked until a user gesture unlocks audio.
    });
  } catch {
    // Ignore missing/corrupt assets.
  }
}

/** Record that we already chimed for this thread (dedupe finish vs in_review). */
export function noteAgentFinishedSoundPlayed(threadKey: string): void {
  const key = threadKey.trim();
  if (!key) return;
  const now = Date.now();
  recentPlayByThreadKey.set(key, now);
  for (const [entryKey, at] of recentPlayByThreadKey) {
    if (now - at > RECENT_PLAY_TTL_MS) {
      recentPlayByThreadKey.delete(entryKey);
    }
  }
}

export function wasAgentFinishedSoundRecentlyPlayed(threadKey: string, now = Date.now()): boolean {
  const key = threadKey.trim();
  if (!key) return false;
  const at = recentPlayByThreadKey.get(key);
  if (at == null) return false;
  if (now - at > RECENT_PLAY_TTL_MS) {
    recentPlayByThreadKey.delete(key);
    return false;
  }
  return true;
}

/**
 * Play + remember, unless we already chimed for this thread recently.
 * Used by BacksterOS in_review promotion so the attention sound still fires
 * when the user is away from the UI.
 */
export function playAgentFinishedSoundForThread(threadKey: string): void {
  if (wasAgentFinishedSoundRecentlyPlayed(threadKey)) return;
  noteAgentFinishedSoundPlayed(threadKey);
  playAgentFinishedSound();
}
