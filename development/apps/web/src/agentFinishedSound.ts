/**
 * Play a short chime when an agent turn finishes.
 * Uses a singleton HTMLAudioElement so overlapping finishes don't stack.
 * Suppressed while the user already has that chat in focus.
 */

const AGENT_FINISHED_SOUND_URL = "/sounds/agent-finished.mp3";

let audio: HTMLAudioElement | null = null;
let unlocked = false;

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
