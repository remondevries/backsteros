/**
 * Streaming stripper for ANSI/VT escape sequences.
 * Holds back a trailing incomplete ESC sequence across chunks so codes split
 * mid-stream (e.g. "\u001b" then "[32m") are removed cleanly.
 */

const ESC = "\u001b";

/** Match one complete CSI / OSC / Fe escape at the start of `text`. */
const COMPLETE_ESCAPE_AT_START =
  /^\u001B(?:\[[0-?]*[ -/]*[@-~]|][^\u0007\u001B]*(?:\u0007|\u001B\\)|[@-Z\\-_])/;

const ANSI_PATTERN =
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|][^\u0007\u001B]*(?:\u0007|\u001B\\)|[@-Z\\-_])/g;

/** True when `text` ends with an incomplete ANSI/OSC/CSI escape. */
function incompleteEscapeSuffix(text: string): string {
  const escIndex = text.lastIndexOf(ESC);
  if (escIndex < 0) return "";

  const tail = text.slice(escIndex);
  if (COMPLETE_ESCAPE_AT_START.test(tail)) {
    // Last ESC starts a finished sequence (possibly with trailing plain text).
    return "";
  }
  return tail;
}

export function createAnsiStripper() {
  let pending = "";

  return {
    push(chunk: string): string {
      if (!chunk) return "";
      const combined = pending + chunk;
      const hold = incompleteEscapeSuffix(combined);
      const complete = hold
        ? combined.slice(0, combined.length - hold.length)
        : combined;
      pending = hold;
      return complete.replace(ANSI_PATTERN, "");
    },
    flush(): string {
      if (!pending) return "";
      const leftover = pending.replace(ANSI_PATTERN, "");
      pending = "";
      // Drop a bare trailing ESC — never meaningful alone in logs.
      return leftover === ESC ? "" : leftover;
    },
  };
}

export function stripAnsi(text: string): string {
  const stripper = createAnsiStripper();
  return `${stripper.push(text)}${stripper.flush()}`;
}
