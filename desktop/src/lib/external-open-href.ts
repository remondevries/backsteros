/**
 * Watch for in-app href open requests from Dynamic Island (and other tools).
 * Island writes the path (e.g. `/tasks/{id}`) to these trigger files.
 *
 * Matches the Rust watcher: seed the current stamp on first read so a leftover
 * file from a previous session does not auto-navigate; only fresh writes open.
 */

const OPEN_HREF_RELATIVE_PATH = ".config/backsteros/open-href";
const OPEN_HREF_TMP_PATH = "/tmp/backsteros-open-href";
const POLL_MS = 250;

export type ExternalOpenHrefHandler = (href: string) => void;

/** Module-level so React remounts do not re-open leftover trigger files. */
let sharedLastStamp: string | null = null;
let sharedSeeded = false;

/** Test helper — resets watcher seed state between cases. */
export function resetExternalOpenHrefWatcherStateForTests() {
  sharedLastStamp = null;
  sharedSeeded = false;
}

export function normalizeHref(raw: string): string | null {
  for (const line of raw.split(/\r?\n/)) {
    const href = line.trim();
    if (href.startsWith("/") && !href.startsWith("//")) return href;
  }
  return null;
}

/**
 * Decide whether a trigger-file stamp should navigate.
 * `seeded=false` → record stamp only (ignore leftovers). Later changes open.
 */
export function consumeOpenHrefStamp(
  rawStamp: string,
  state: { seeded: boolean; lastStamp: string | null },
): {
  seeded: boolean;
  lastStamp: string | null;
  href: string | null;
} {
  const stamp = rawStamp.trim();
  if (!stamp) {
    return {
      seeded: true,
      lastStamp: state.lastStamp ?? "",
      href: null,
    };
  }

  if (!state.seeded) {
    return { seeded: true, lastStamp: stamp, href: null };
  }

  if (stamp === state.lastStamp) {
    return { seeded: true, lastStamp: state.lastStamp, href: null };
  }

  return {
    seeded: true,
    lastStamp: stamp,
    href: normalizeHref(stamp),
  };
}

/**
 * Poll trigger files and invoke `onOpen` when a new href appears.
 * Returns an unsubscribe function.
 */
export function startExternalOpenHrefWatcher(
  onOpen: ExternalOpenHrefHandler,
): () => void {
  let stopped = false;
  let timer: number | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const { homeDir, join } = await import("@tauri-apps/api/path");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const home = await homeDir();
      const homePath = await join(home, OPEN_HREF_RELATIVE_PATH);

      let raw = "";
      try {
        raw = await readTextFile(homePath);
      } catch {
        try {
          raw = await readTextFile(OPEN_HREF_TMP_PATH);
        } catch {
          raw = "";
        }
      }

      const next = consumeOpenHrefStamp(raw, {
        seeded: sharedSeeded,
        lastStamp: sharedLastStamp,
      });
      sharedSeeded = next.seeded;
      sharedLastStamp = next.lastStamp;
      if (next.href) onOpen(next.href);
    } catch {
      // Ignore when desktop FS APIs are unavailable.
    }
  };

  void tick();
  timer = window.setInterval(() => {
    void tick();
  }, POLL_MS);

  return () => {
    stopped = true;
    if (timer != null) window.clearInterval(timer);
  };
}
