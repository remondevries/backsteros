/**
 * In-memory per-project run sessions. Survives in-app navigation (component
 * unmount) so a started command keeps streaming until the user stops it or it
 * exits. Does not survive a full page reload — disconnecting the fetch aborts
 * the server child.
 */

export type ProjectRunExit = {
  code: number | null;
  signal: string | null;
  aborted?: boolean;
};

export type ProjectRunSession = {
  projectId: string;
  command: string;
  cwd: string;
  running: boolean;
  output: string;
  exit: ProjectRunExit | null;
  error: string | null;
};

type Listener = () => void;

type InternalSession = ProjectRunSession & {
  controller: AbortController | null;
  listeners: Set<Listener>;
};

const sessions = new Map<string, InternalSession>();

function emptySession(projectId: string): InternalSession {
  return {
    projectId,
    command: "",
    cwd: "",
    running: false,
    output: "",
    exit: null,
    error: null,
    controller: null,
    listeners: new Set(),
  };
}

function ensure(projectId: string): InternalSession {
  let session = sessions.get(projectId);
  if (!session) {
    session = emptySession(projectId);
    sessions.set(projectId, session);
  }
  return session;
}

function snapshot(session: InternalSession): ProjectRunSession {
  return {
    projectId: session.projectId,
    command: session.command,
    cwd: session.cwd,
    running: session.running,
    output: session.output,
    exit: session.exit,
    error: session.error,
  };
}

function notify(session: InternalSession) {
  for (const listener of session.listeners) {
    listener();
  }
  const runningCount = countRunningSessions();
  if (runningCount !== lastRunningCount) {
    lastRunningCount = runningCount;
    for (const listener of globalListeners) {
      listener();
    }
  }
}

function countRunningSessions(): number {
  let count = 0;
  for (const session of sessions.values()) {
    if (session.running) count += 1;
  }
  return count;
}

const globalListeners = new Set<Listener>();
let lastRunningCount = 0;

function applyEvent(
  session: InternalSession,
  event: {
    type?: string;
    data?: string;
    error?: string;
    code?: number | null;
    signal?: string | null;
    aborted?: boolean;
    command?: string;
  },
) {
  if (event.type === "stdout" || event.type === "stderr") {
    const chunk = event.data ?? "";
    if (chunk) session.output = `${session.output}${chunk}`;
  } else if (event.type === "error") {
    session.error = event.error?.trim() || "Command failed.";
  } else if (event.type === "exit") {
    session.exit = {
      code: event.code ?? null,
      signal: event.signal ?? null,
      aborted: Boolean(event.aborted),
    };
  } else if (event.type === "start" && event.command) {
    if (!session.output) {
      session.output = `$ ${event.command}\n`;
    }
  }
}

function parseNdjsonLine(session: InternalSession, line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    applyEvent(
      session,
      JSON.parse(trimmed) as Parameters<typeof applyEvent>[1],
    );
  } catch {
    /* ignore malformed chunk */
  }
}

export function getProjectRunSession(projectId: string): ProjectRunSession {
  return snapshot(ensure(projectId));
}

export function getRunningProjectRunCount(): number {
  return countRunningSessions();
}

export function listRunningProjectRunSessions(): ProjectRunSession[] {
  const running: ProjectRunSession[] = [];
  for (const session of sessions.values()) {
    if (session.running) running.push(snapshot(session));
  }
  return running;
}

export function subscribeProjectRunSessions(listener: Listener): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

export function subscribeProjectRunSession(
  projectId: string,
  listener: Listener,
): () => void {
  const session = ensure(projectId);
  session.listeners.add(listener);
  return () => {
    session.listeners.delete(listener);
  };
}

export function stopProjectRunSession(projectId: string): void {
  const session = sessions.get(projectId);
  if (!session?.controller) return;
  const controller = session.controller;
  // Eagerly clear running so Escape → edit → ⌘↵ can restart without
  // waiting for the fetch abort / stream teardown to finish.
  session.controller = null;
  session.running = false;
  session.exit = session.exit ?? {
    code: null,
    signal: "SIGTERM",
    aborted: true,
  };
  notify(session);
  controller.abort();
}

export async function startProjectRunSession(options: {
  projectId: string;
  command: string;
  cwd: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const command = options.command.trim();
  if (!command) {
    return { ok: false, error: "Command is required." };
  }
  if (!options.cwd.trim()) {
    return { ok: false, error: "Set a project working directory first." };
  }

  const session = ensure(options.projectId);
  if (session.running) {
    return { ok: false, error: "Already running." };
  }

  session.controller?.abort();
  const controller = new AbortController();
  session.controller = controller;
  session.command = command;
  session.cwd = options.cwd;
  session.running = true;
  session.output = "";
  session.exit = null;
  session.error = null;
  notify(session);

  try {
    const response = await fetch("/api/run-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, cwd: options.cwd }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      const error =
        payload?.error?.trim() || `Command failed (${response.status}).`;
      session.error = error;
      session.running = false;
      session.controller = null;
      notify(session);
      return { ok: false, error };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        parseNdjsonLine(session, line);
      }
      notify(session);
    }

    if (buffer.trim()) {
      parseNdjsonLine(session, buffer);
      notify(session);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      session.exit = session.exit ?? {
        code: null,
        signal: "SIGTERM",
        aborted: true,
      };
    } else {
      session.error =
        error instanceof Error ? error.message : "Failed to run command.";
    }
  } finally {
    if (session.controller === controller) {
      session.controller = null;
    }
    session.running = false;
    notify(session);
  }

  return session.error && !session.exit
    ? { ok: false, error: session.error }
    : { ok: true };
}
