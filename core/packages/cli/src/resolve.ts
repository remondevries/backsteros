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

export async function listAllProjects(client: CliClient): Promise<ProjectRef[]> {
  const res = await client.contract.listProjects({ query: {} });
  if (res.status !== 200) {
    throw new Error(`listProjects failed with status ${res.status}`);
  }
  return res.body.projects.map((p) => ({
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
    const projectId = await resolveProjectId(client, projectKey);
    const res = await client.contract.listTasks({
      query: { projectId },
    });
    if (res.status !== 200) {
      throw new Error(`listTasks failed with status ${res.status}`);
    }
    const task = res.body.tasks.find((t) => t.number === number);
    if (!task) {
      throw new Error(`Task not found: ${projectKey}-${number}`);
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
