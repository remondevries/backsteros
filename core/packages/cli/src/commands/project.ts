import type { CreateProjectInput, UpdateProjectInput } from "@backsteros/contracts";
import type { CliClient, CliConfig } from "../config.js";
import { emitResult } from "../output.js";
import { resolveProjectId } from "../resolve.js";

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

function projectFlags(
  values: Record<string, string | boolean | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof values.key === "string") out.key = values.key;
  if (typeof values.name === "string") out.name = values.name;
  if (typeof values.summary === "string") out.summary = values.summary;
  if (typeof values.description === "string") out.description = values.description;
  if (typeof values.status === "string") out.status = values.status;
  if (typeof values.area === "string") out.area = values.area;
  if (typeof values.type === "string") out.type = values.type;
  const priority = optionalInt(values.priority);
  if (priority !== undefined) out.priority = priority;
  if (typeof values["working-dir"] === "string") {
    out.localWorkingDirectory = values["working-dir"];
  }
  return mergeBody(out, values.body);
}

export async function runProjectCommand(
  client: CliClient,
  config: CliConfig,
  action: string | undefined,
  positionals: string[],
  values: Record<string, string | boolean | undefined>,
): Promise<void> {
  switch (action) {
    case "list": {
      const res = await client.contract.listProjects({ query: {} });
      if (res.status !== 200) throw new Error(`list failed (${res.status})`);
      const projects = res.body.projects;
      emitResult(
        config.json,
        { projects },
        projects
          .map((p) => `${p.key}\t${p.status}\t${p.name}\t${p.id}`)
          .join("\n") || "(no projects)",
      );
      return;
    }
    case "get": {
      const ref = positionals[0];
      if (!ref) throw new Error("Usage: backsteros project get <id|KEY>");
      const id = await resolveProjectId(client, ref);
      const res = await client.contract.getProject({ params: { id } });
      if (res.status !== 200) throw new Error(`get failed (${res.status})`);
      const p = res.body;
      emitResult(
        config.json,
        p,
        `${p.key}  ${p.status}  ${p.name}  (${p.id})`,
      );
      return;
    }
    case "create": {
      const body = projectFlags(values) as CreateProjectInput;
      if (!body.key || !body.name) {
        throw new Error(
          "Usage: backsteros project create --key KEY --name NAME [...]",
        );
      }
      const res = await client.contract.createProject({ body });
      if (res.status !== 201) throw new Error(`create failed (${res.status})`);
      const p = res.body;
      emitResult(
        config.json,
        p,
        `created ${p.key}  ${p.name}  (${p.id})`,
      );
      return;
    }
    case "update": {
      const ref = positionals[0];
      if (!ref) throw new Error("Usage: backsteros project update <id|KEY> [...]");
      const id = await resolveProjectId(client, ref);
      const body = projectFlags(values) as UpdateProjectInput;
      if (Object.keys(body).length === 0) {
        throw new Error("Provide at least one field to update (or --body)");
      }
      const res = await client.contract.updateProject({
        params: { id },
        body,
      });
      if (res.status !== 200) throw new Error(`update failed (${res.status})`);
      const p = res.body;
      emitResult(
        config.json,
        p,
        `updated ${p.key}  ${p.status}  ${p.name}  (${p.id})`,
      );
      return;
    }
    case "delete": {
      const ref = positionals[0];
      if (!ref) throw new Error("Usage: backsteros project delete <id|KEY>");
      const id = await resolveProjectId(client, ref);
      const res = await client.contract.deleteProject({ params: { id } });
      if (res.status !== 204) throw new Error(`delete failed (${res.status})`);
      emitResult(config.json, { ok: true, id }, `deleted project ${ref} (${id})`);
      return;
    }
    default:
      throw new Error(
        `Unknown project action "${action ?? ""}". Use list|get|create|update|delete.`,
      );
  }
}
