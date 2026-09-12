/**
 * Play a short chime when an agent turn finishes.
 * Uses a singleton HTMLAudioElement so overlapping finishes don't stack.
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
