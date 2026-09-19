import { useSyncExternalStore } from "react";

export type StreamConnectionStatus = "connecting" | "live" | "disconnected";

type NoticeState = {
  email: StreamConnectionStatus | "off";
  presence: StreamConnectionStatus | "off";
  rest: string | null;
};

let state: NoticeState = {
  email: "off",
  presence: "off",
  rest: null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<NoticeState>) {
  state = { ...state, ...patch };
  emit();
}

export function setEmailStreamStatus(status: StreamConnectionStatus | "off") {
  if (state.email === status) return;
  setState({ email: status });
}

export function setPresenceStreamStatus(status: StreamConnectionStatus | "off") {
  if (state.presence === status) return;
  setState({ presence: status });
}

const restSeen = new Set<string>();

/** Once per kind, so a letter title edit does not nag on every keystroke. */
export function reportLocalOnlyRest(kind: "scope" | "relocate") {
  if (restSeen.has(kind)) return;
  restSeen.add(kind);
  const rest =
    kind === "scope"
      ? "Task move is queued for cloud sync. The display number may lag. Local-core was not started."
      : "Letter title is queued for cloud sync. Renaming the PDF on disk is skipped so Docker is not started.";
  setState({ rest });
}

export function getCloudClientNotices(): NoticeState {
  return state;
}

export function subscribeCloudClientNotices(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCloudClientNotices(): NoticeState {
  return useSyncExternalStore(
    subscribeCloudClientNotices,
    getCloudClientNotices,
    getCloudClientNotices,
  );
}
