import type { CreateTaskInput, UpdateTaskInput } from "@backsteros/contracts";
import type { CliClient, CliConfig } from "../config.js";
import { emitResult } from "../output.js";
import { resolveProjectId, resolveTaskId } from "../resolve.js";

function optionalInt(value: string | boolean | undefined): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer: ${value}`);
  return n;
}

function mergeBody(
  base: Record<string, unknown>,
  bodyFlag: string | boolean | undefined,
): Record<string, unknown> {
  if (typeof bodyFlag !== "string" || !bodyFlag.trim()) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyFlag);
  } catch {
    throw new Error("--body must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--body must be a JSON object");
  }
  return { ...base, ...(parsed as Record<string, unknown>) };
}

async function taskFlags(
  client: CliClient,
  config: CliConfig,
  values: Record<string, string | boolean | undefined>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    activityActor: config.activityActor,
  };
  if (typeof values.title === "string") out.title = values.title;
  if (typeof values.description === "string") out.description = values.description;
  if (typeof values.status === "string") out.status = values.status;
  if (typeof values.assignee === "string") out.assigneeId = values.assignee;
  if (typeof values.inbox === "boolean") out.inbox = values.inbox;
  const priority = optionalInt(values.priority);
  if (priority !== undefined) out.priority = priority;
  if (typeof values.project === "string") {
    out.projectId = await resolveProjectId(client, values.project);
  }
  return mergeBody(out, values.body);
}

function taskSummary(
  task: {
    id: string;
    number: number;
    title: string;
    status: string;
    projectId: string | null;
  },
  projectKey?: string | null,
): string {
  const label = projectKey ? `${projectKey}-${task.number}` : `#${task.number}`;
  return `${label}  ${task.status}  ${task.title}  (${task.id})`;
}

export async function runTaskCommand(
  client: CliClient,
  config: CliConfig,
  action: string | undefined,
  positionals: string[],
  values: Record<string, string | boolean | undefined>,
): Promise<void> {
  switch (action) {
    case "list": {
      const query: { projectId?: string; status?: string } = {};
      if (typeof values.project === "string") {
        query.projectId = await resolveProjectId(client, values.project);
      }
      if (typeof values.status === "string") query.status = values.status;
      const res = await client.contract.listTasks({ query });
      if (res.status !== 200) throw new Error(`list failed (${res.status})`);
      const tasks = res.body.tasks;
      emitResult(
        config.json,
        { tasks },
        tasks
          .map(
            (t) =>
              `${t.number}\t${t.status}\t${t.title}\t${t.id}\t${t.projectId ?? ""}`,
          )
          .join("\n") || "(no tasks)",
      );
      return;
    }
    case "get": {
      const ref = positionals[0];
      if (!ref) throw new Error("Usage: backsteros task get <id|KEY-number>");
      const id = await resolveTaskId(client, ref);
      const res = await client.contract.getTask({ params: { id } });
      if (res.status !== 200) throw new Error(`get failed (${res.status})`);
      const t = res.body;
      let projectKey: string | null = null;
      if (t.projectId) {
        const p = await client.contract.getProject({
          params: { id: t.projectId },
        });
        if (p.status === 200) projectKey = p.body.key;
      }
      emitResult(config.json, t, taskSummary(t, projectKey));
      return;
    }
    case "create": {
      const body = (await taskFlags(client, config, values)) as CreateTaskInput;
      if (!body.title) {
        throw new Error(
          "Usage: backsteros task create --title TITLE [--project KEY] [...]",
        );
      }
      const res = await client.contract.createTask({ body });
      if (res.status !== 201) throw new Error(`create failed (${res.status})`);
      const t = res.body;
      let projectKey: string | null = null;
      if (t.projectId) {
        const p = await client.contract.getProject({
          params: { id: t.projectId },
        });
        if (p.status === 200) projectKey = p.body.key;
      }
      emitResult(config.json, t, `created ${taskSummary(t, projectKey)}`);
      return;
    }
    case "update": {
      const ref = positionals[0];
      if (!ref) {
        throw new Error("Usage: backsteros task update <id|KEY-number> [...]");
      }
      const id = await resolveTaskId(client, ref);
      const body = (await taskFlags(client, config, values)) as UpdateTaskInput;
      const keys = Object.keys(body).filter((k) => k !== "activityActor");
      if (keys.length === 0) {
        throw new Error("Provide at least one field to update (or --body)");
      }
      const res = await client.contract.updateTask({
        params: { id },
        body,
      });
      if (res.status !== 200) throw new Error(`update failed (${res.status})`);
      const t = res.body;
      let projectKey: string | null = null;
      if (t.projectId) {
        const p = await client.contract.getProject({
          params: { id: t.projectId },
        });
        if (p.status === 200) projectKey = p.body.key;
      }
      emitResult(config.json, t, `updated ${taskSummary(t, projectKey)}`);
      return;
    }
    case "delete": {
      const ref = positionals[0];
      if (!ref) throw new Error("Usage: backsteros task delete <id|KEY-number>");
      const id = await resolveTaskId(client, ref);
      const res = await client.contract.deleteTask({ params: { id } });
      if (res.status !== 204) throw new Error(`delete failed (${res.status})`);
      emitResult(config.json, { ok: true, id }, `deleted task ${ref} (${id})`);
      return;
    }
    default:
      throw new Error(
        `Unknown task action "${action ?? ""}". Use list|get|create|update|delete.`,
      );
  }
}
