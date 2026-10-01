import { TASK_STATUSES } from "@backsteros/contracts";
import type { ListTasksQuery, Project } from "@backsteros/contracts";
import type { CliClient } from "./config.js";

const DISPLAY_ID_RE = /^([A-Za-z0-9]{2,3})-(\d+)$/;

export type ProjectRef = { id: string; key: string; name: string };

export type TaskRef = {
  id: string;
  number: number;
  title: string;
  status: string;
  projectId: string | null;
};

/** Row shape shared by paginated `items` and legacy `tasks` responses. */
export type TaskListRow = {
  id: string;
  key?: string;
  number?: number;
  title: string;
  status: string;
  projectId: string | null;
  priority?: number;
  dueDate?: string | null;
  assigneeId?: string | null;
};

/** Hard stop so a broken cursor can never loop forever. */
const MAX_TASK_LIST_PAGES = 100;

/**
 * GET /tasks in paginated mode (paginated=true), following nextCursor until
 * done. Reads `items`, falling back to legacy `tasks` for older servers.
 */
export async function listTaskItems(
  client: CliClient,
  filters: Omit<ListTasksQuery, "paginated" | "cursor">,
): Promise<TaskListRow[]> {
  const out: TaskListRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_TASK_LIST_PAGES; page++) {
    const res = await client.contract.listTasks({
      query: {
        ...filters,
        limit: filters.limit ?? 200,
        paginated: true,
        ...(cursor ? { cursor } : {}),
      },
    });
    if (res.status !== 200) {
      const detail =
        res.body && typeof res.body === "object" && "error" in res.body
          ? `: ${String((res.body as { error: unknown }).error)}`
          : "";
      throw new Error(`listTasks failed with status ${res.status}${detail}`);
    }
    const body = res.body as {
      items?: TaskListRow[];
      tasks?: TaskListRow[];
      nextCursor?: string | null;
    };
    out.push(...(body.items ?? body.tasks ?? []));
    cursor = body.items ? body.nextCursor ?? undefined : undefined;
    if (!cursor) break;
  }
  return out;
}

export async function listAllProjects(client: CliClient): Promise<ProjectRef[]> {
  const res = await client.contract.listProjects({ query: {} });
  if (res.status !== 200) {
    throw new Error(`listProjects failed with status ${res.status}`);
  }
  return res.body.projects.map((p: Project) => ({
    id: p.id,
    key: p.key,
    name: p.name,
  }));
}

export async function resolveProjectId(
  client: CliClient,
  ref: string,
): Promise<string> {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error("Project id/key is required");

  // Prefer direct id lookup when it looks like a stored id (not a 2–3 char key).
  if (trimmed.length > 3) {
    try {
      const res = await client.contract.getProject({ params: { id: trimmed } });
      if (res.status === 200) return res.body.id;
    } catch {
      /* fall through to key lookup */
    }
  }

  const key = trimmed.toUpperCase();
  const projects = await listAllProjects(client);
  const match = projects.find((p) => p.key.toUpperCase() === key);
  if (!match) {
    throw new Error(`Project not found: ${ref}`);
  }
  return match.id;
}

export async function resolveTaskId(
  client: CliClient,
  ref: string,
): Promise<string> {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error("Task id / KEY-number is required");

  const display = DISPLAY_ID_RE.exec(trimmed);
  if (display) {
    const projectKey = display[1]!.toUpperCase();
    const number = Number(display[2]);
    const wanted = `${projectKey}-${number}`;
    const projectId = await resolveProjectId(client, projectKey);
    // OS-45: paginated mode (all statuses), match on the server `key`.
    const items = await listTaskItems(client, {
      projectId,
      status: TASK_STATUSES.join(","),
    });
    const task = items.find((t) => t.key?.toUpperCase() === wanted);
    if (!task) {
      throw new Error(`Task not found: ${wanted}`);
    }
    return task.id;
  }

  const res = await client.contract.getTask({ params: { id: trimmed } });
  if (res.status !== 200) {
    throw new Error(`Task not found: ${ref}`);
  }
  return res.body.id;
}

export function parseDisplayId(
  ref: string,
): { projectKey: string; number: number } | null {
  const match = DISPLAY_ID_RE.exec(ref.trim());
  if (!match) return null;
  return { projectKey: match[1]!.toUpperCase(), number: Number(match[2]) };
}
