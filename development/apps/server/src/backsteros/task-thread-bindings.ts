/**
 * Server-side BacksterOS task ↔ T3 thread bindings.
 * Lets the control API and the web rail share the same task chat link.
 */
import fs from "node:fs";
import path from "node:path";

export type BacksterosTaskThreadBinding = {
  readonly kind: "thread";
  readonly threadId: string;
  readonly environmentId: string;
  readonly t3ProjectId: string;
  readonly backsterosProjectId: string;
  readonly projectTitle: string;
  readonly title: string;
  readonly displayId: string | null;
  readonly updatedAt: string;
};

type BindingsFile = {
  readonly version: 1;
  readonly byTaskId: Record<string, BacksterosTaskThreadBinding>;
};

function emptyBindings(): BindingsFile {
  return { version: 1, byTaskId: {} };
}

function bindingsPath(stateDir: string): string {
  return path.join(stateDir, "backsteros-task-threads.json");
}

function normalizeBinding(raw: unknown): BacksterosTaskThreadBinding | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    value.kind !== "thread" ||
    typeof value.threadId !== "string" ||
    typeof value.environmentId !== "string" ||
    typeof value.t3ProjectId !== "string" ||
    typeof value.backsterosProjectId !== "string" ||
    typeof value.title !== "string"
  ) {
    return null;
  }
  return {
    kind: "thread",
    threadId: value.threadId.trim(),
    environmentId: value.environmentId.trim(),
    t3ProjectId: value.t3ProjectId.trim(),
    backsterosProjectId: value.backsterosProjectId.trim(),
    projectTitle: typeof value.projectTitle === "string" ? value.projectTitle : "",
    title: value.title,
    displayId: typeof value.displayId === "string" ? value.displayId : null,
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt.trim()
        ? value.updatedAt.trim()
        : new Date(0).toISOString(),
  };
}

export function readBacksterosTaskThreadBindings(stateDir: string): BindingsFile {
  try {
    const raw = fs.readFileSync(bindingsPath(stateDir), "utf8");
    const parsed = JSON.parse(raw) as { byTaskId?: Record<string, unknown> };
    const byTaskId: Record<string, BacksterosTaskThreadBinding> = {};
    for (const [taskId, entry] of Object.entries(parsed.byTaskId ?? {})) {
      const binding = normalizeBinding(entry);
      if (binding) byTaskId[taskId] = binding;
    }
    return { version: 1, byTaskId };
  } catch {
    return emptyBindings();
  }
}

export function writeBacksterosTaskThreadBinding(
  stateDir: string,
  taskId: string,
  binding: Omit<BacksterosTaskThreadBinding, "kind" | "updatedAt"> & {
    readonly updatedAt?: string;
  },
): BacksterosTaskThreadBinding {
  const next: BacksterosTaskThreadBinding = {
    kind: "thread",
    threadId: binding.threadId,
    environmentId: binding.environmentId,
    t3ProjectId: binding.t3ProjectId,
    backsterosProjectId: binding.backsterosProjectId,
    projectTitle: binding.projectTitle,
    title: binding.title,
    displayId: binding.displayId,
    updatedAt: binding.updatedAt ?? new Date().toISOString(),
  };
  const current = readBacksterosTaskThreadBindings(stateDir);
  const file: BindingsFile = {
    version: 1,
    byTaskId: {
      ...current.byTaskId,
      [taskId]: next,
    },
  };
  const filePath = bindingsPath(stateDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return next;
}

export function findBacksterosTaskThreadBinding(
  stateDir: string,
  input: { readonly taskId?: string; readonly threadId?: string; readonly displayId?: string },
): { readonly taskId: string; readonly binding: BacksterosTaskThreadBinding } | null {
  const file = readBacksterosTaskThreadBindings(stateDir);
  if (input.taskId) {
    const binding = file.byTaskId[input.taskId];
    return binding ? { taskId: input.taskId, binding } : null;
  }
  if (input.threadId) {
    for (const [taskId, binding] of Object.entries(file.byTaskId)) {
      if (binding.threadId === input.threadId) return { taskId, binding };
    }
  }
  if (input.displayId) {
    const needle = input.displayId.trim().toUpperCase();
    for (const [taskId, binding] of Object.entries(file.byTaskId)) {
      if (binding.displayId?.toUpperCase() === needle) return { taskId, binding };
    }
  }
  return null;
}

export function listBacksterosTaskThreadBindings(
  stateDir: string,
): ReadonlyArray<{ readonly taskId: string; readonly binding: BacksterosTaskThreadBinding }> {
  const file = readBacksterosTaskThreadBindings(stateDir);
  return Object.entries(file.byTaskId).map(([taskId, binding]) => ({ taskId, binding }));
}
