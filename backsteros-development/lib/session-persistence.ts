const STORAGE_KEY = "backsteros-development.session-buckets";

export type PersistedTerminalSession = {
  id: string;
  kind: "terminal";
  title: string;
  defaultTitle: string;
  projectId: string | null;
  projectLabel: string;
  cwd: string | null;
};

export type PersistedSession = PersistedTerminalSession;

export type PersistedTaskBucket = {
  sessions: PersistedSession[];
  activeId: string | null;
};

export type PersistedBuckets = Record<string, PersistedTaskBucket>;

export function readSessionBuckets(): PersistedBuckets {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: PersistedBuckets = {};
    for (const [taskId, bucket] of Object.entries(parsed)) {
      if (!bucket || typeof bucket !== "object") continue;
      const sessionsRaw = (bucket as { sessions?: unknown }).sessions;
      if (!Array.isArray(sessionsRaw)) continue;
      const sessions: PersistedSession[] = [];
      for (const entry of sessionsRaw) {
        if (!entry || typeof entry !== "object") continue;
        const kind = (entry as { kind?: unknown }).kind;
        const id = (entry as { id?: unknown }).id;
        if (typeof id !== "string" || !id) continue;
        // Drop legacy browser sessions; keep the first terminal only.
        if (kind === "browser") continue;
        if (kind !== undefined && kind !== "terminal") continue;
        const title =
          typeof (entry as { title?: unknown }).title === "string"
            ? (entry as { title: string }).title
            : "shell";
        const defaultTitle =
          typeof (entry as { defaultTitle?: unknown }).defaultTitle === "string"
            ? (entry as { defaultTitle: string }).defaultTitle
            : title;
        sessions.push({
          id,
          kind: "terminal",
          title,
          defaultTitle,
          projectId:
            typeof (entry as { projectId?: unknown }).projectId === "string"
              ? (entry as { projectId: string }).projectId
              : null,
          projectLabel:
            typeof (entry as { projectLabel?: unknown }).projectLabel ===
            "string"
              ? (entry as { projectLabel: string }).projectLabel
              : "shell",
          cwd:
            typeof (entry as { cwd?: unknown }).cwd === "string"
              ? (entry as { cwd: string }).cwd
              : null,
        });
        break;
      }
      out[taskId] = {
        sessions,
        activeId: sessions[0]?.id ?? null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function writeSessionBuckets(buckets: PersistedBuckets): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buckets));
  } catch {
    /* ignore quota */
  }
}

const WORKING_TASKS_KEY = "backsteros-development.working-task-ids";

/** Task ids whose agent turn is still in progress (survives terminal remount). */
export function readWorkingTaskIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(WORKING_TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export function writeWorkingTaskIds(taskIds: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      WORKING_TASKS_KEY,
      JSON.stringify([...taskIds]),
    );
  } catch {
    /* ignore quota */
  }
}

