import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type {
  CreateTaskAgentRunCheckInput,
  CreateTaskAgentRunInput,
  TaskAgentRun,
  TaskAgentRunCheck,
  UpdateTaskAgentRunCheckInput,
  UpdateTaskAgentRunInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  agents,
  projects,
  taskAgentRunChecks,
  taskAgentRuns,
  tasks,
  type DbTaskAgentRun,
  type DbTaskAgentRunCheck,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  getOrCreateChatThread,
  postChatThreadMessage,
} from "./agent-chat.js";

function badRequest(message: string): Error {
  return Object.assign(new Error(message), {
    status: 400,
    code: "bad_request",
  });
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), {
    status: 404,
    code: "not_found",
  });
}

function toCheck(row: DbTaskAgentRunCheck): TaskAgentRunCheck {
  return {
    id: row.id,
    runId: row.runId,
    key: row.key,
    label: row.label,
    status: row.status as TaskAgentRunCheck["status"],
    detail: row.detail ?? null,
    logText: row.logText ?? null,
    sortOrder: row.sortOrder,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRun(
  row: DbTaskAgentRun,
  checks?: readonly DbTaskAgentRunCheck[],
): TaskAgentRun {
  return {
    id: row.id,
    taskId: row.taskId,
    projectId: row.projectId ?? null,
    conductorAgentId: row.conductorAgentId,
    conductorContactId: row.conductorContactId ?? null,
    phase: row.phase as TaskAgentRun["phase"],
    cycle: row.cycle,
    status: row.status as TaskAgentRun["status"],
    briefThreadId: row.briefThreadId ?? null,
    builderSessionId: row.builderSessionId ?? null,
    buildPrompt: row.buildPrompt ?? null,
    recordIntent: (row.recordIntent as TaskAgentRun["recordIntent"]) ?? null,
    recordNotes: row.recordNotes ?? null,
    lastError: row.lastError ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(checks ? { checks: checks.map(toCheck) } : {}),
  };
}

async function loadChecks(
  workspaceId: string,
  runId: string,
): Promise<DbTaskAgentRunCheck[]> {
  return db
    .select()
    .from(taskAgentRunChecks)
    .where(
      and(
        eq(taskAgentRunChecks.workspaceId, workspaceId),
        eq(taskAgentRunChecks.runId, runId),
      ),
    )
    .orderBy(asc(taskAgentRunChecks.sortOrder), asc(taskAgentRunChecks.createdAt));
}

async function getRunRow(
  workspaceId: string,
  runId: string,
): Promise<DbTaskAgentRun | null> {
  const [row] = await db
    .select()
    .from(taskAgentRuns)
    .where(
      and(
        eq(taskAgentRuns.workspaceId, workspaceId),
        eq(taskAgentRuns.id, runId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getTaskAgentRun(
  workspaceId: string,
  runId: string,
  options: { includeChecks?: boolean } = {},
): Promise<TaskAgentRun | null> {
  const row = await getRunRow(workspaceId, runId);
  if (!row) return null;
  const checks = options.includeChecks
    ? await loadChecks(workspaceId, runId)
    : undefined;
  return toRun(row, checks);
}

export async function getActiveTaskAgentRun(
  workspaceId: string,
  taskId: string,
  options: { includeChecks?: boolean } = {},
): Promise<TaskAgentRun | null> {
  const [row] = await db
    .select()
    .from(taskAgentRuns)
    .where(
      and(
        eq(taskAgentRuns.workspaceId, workspaceId),
        eq(taskAgentRuns.taskId, taskId),
        eq(taskAgentRuns.status, "active"),
      ),
    )
    .orderBy(desc(taskAgentRuns.createdAt))
    .limit(1);
  if (!row) return null;
  const checks = options.includeChecks
    ? await loadChecks(workspaceId, row.id)
    : undefined;
  return toRun(row, checks);
}

function buildWakeMessage(input: {
  runId: string;
  cycle: number;
  task: {
    id: string;
    number: number | null;
    title: string;
    status: string;
    description: string | null;
    displayKey: string | null;
  };
  project: {
    id: string;
    key: string;
    name: string;
    localWorkingDirectory: string | null;
    githubRepository: string | null;
  } | null;
}): string {
  const lines = [
    "You are the conductor for a BacksterOS task agent factory run.",
    "Reply in this Brief thread. When ready to code, PATCH the run to phase=build with buildPrompt.",
    "After build, create Verify checks and advance phase=verify. On results, either loop (phase=brief, cycle++) or phase=record with recordIntent=pr|commit.",
    "",
    `taskAgentRun: id=${input.runId} phase=brief cycle=${input.cycle}`,
    `task: id=${input.task.id} number=${input.task.number ?? "—"} status=${input.task.status}`,
    `title: ${input.task.title}`,
  ];
  if (input.task.displayKey) {
    lines.push(`displayId: ${input.task.displayKey}`);
  }
  if (input.project) {
    lines.push(
      `project: id=${input.project.id} key=${input.project.key} name=${input.project.name}`,
    );
    if (input.project.localWorkingDirectory) {
      lines.push(`cwd: ${input.project.localWorkingDirectory}`);
    }
    if (input.project.githubRepository) {
      lines.push(`githubRepository: ${input.project.githubRepository}`);
    }
  }
  if (input.task.description?.trim()) {
    lines.push("", "description:", input.task.description.trim());
  }
  return lines.join("\n");
}

export async function createTaskAgentRun(
  workspaceId: string,
  taskId: string,
  input: CreateTaskAgentRunInput,
  auth: {
    apiKeyId?: string | null;
    authorContactId?: string | null;
    authorName?: string | null;
  },
): Promise<TaskAgentRun> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, taskId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (!task) throw notFound("Task");

  const conductorAgentId = input.conductorAgentId.trim();
  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.id, conductorAgentId),
      ),
    )
    .limit(1);
  if (!agent) throw notFound("Agent");
  if (!agent.enabled) throw badRequest("Agent is disabled");

  const replaceActive = input.replaceActive !== false;
  if (replaceActive) {
    await db
      .update(taskAgentRuns)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
        lastError: "Replaced by a new agent run",
      })
      .where(
        and(
          eq(taskAgentRuns.workspaceId, workspaceId),
          eq(taskAgentRuns.taskId, taskId),
          eq(taskAgentRuns.status, "active"),
        ),
      );
  } else {
    const existing = await getActiveTaskAgentRun(workspaceId, taskId);
    if (existing) {
      throw badRequest("An active agent run already exists for this task");
    }
  }

  let project: {
    id: string;
    key: string;
    name: string;
    localWorkingDirectory: string | null;
    githubRepository: string | null;
  } | null = null;
  if (task.projectId) {
    const [row] = await db
      .select({
        id: projects.id,
        key: projects.key,
        name: projects.name,
        localWorkingDirectory: projects.localWorkingDirectory,
        githubRepository: projects.githubRepository,
      })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.id, task.projectId),
        ),
      )
      .limit(1);
    project = row
      ? {
          id: row.id,
          key: row.key,
          name: row.name,
          localWorkingDirectory: row.localWorkingDirectory ?? null,
          githubRepository: row.githubRepository ?? null,
        }
      : null;
  }

  const now = new Date();
  const runId = newId();
  let briefThreadId: string | null = null;

  const wakeConductor = input.wakeConductor !== false;
  if (wakeConductor) {
    const thread = await getOrCreateChatThread(workspaceId, {
      agentId: conductorAgentId,
    });
    briefThreadId = thread.id;
    const wakeBody = buildWakeMessage({
      runId,
      cycle: 1,
      task: {
        id: task.id,
        number: task.number ?? null,
        title: task.title,
        status: task.status,
        description: task.description ?? null,
        displayKey: project?.key
          ? `${project.key}-${task.number ?? "?"}`
          : null,
      },
      project,
    });
    // Wake as a *user* message so the conductor webhook fires. Passing the
    // owner's apiKeyId would be treated as an agent reply and 403 (owner key
    // ≠ conductor agent key).
    await postChatThreadMessage(workspaceId, thread.id, wakeBody, {
      apiKeyId: null,
      authorContactId: auth.authorContactId ?? null,
      authorName: auth.authorName?.trim() || "Remon",
    });
  }

  const [created] = await db
    .insert(taskAgentRuns)
    .values({
      id: runId,
      workspaceId,
      taskId,
      projectId: task.projectId ?? null,
      conductorAgentId,
      conductorContactId: agent.contactId ?? null,
      phase: "brief",
      cycle: 1,
      status: "active",
      briefThreadId,
      builderSessionId: null,
      buildPrompt: null,
      recordIntent: null,
      recordNotes: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return toRun(created!, []);
}

export async function updateTaskAgentRun(
  workspaceId: string,
  runId: string,
  input: UpdateTaskAgentRunInput,
): Promise<TaskAgentRun | null> {
  const existing = await getRunRow(workspaceId, runId);
  if (!existing) return null;

  const patch: Partial<DbTaskAgentRun> = { updatedAt: new Date() };
  if (input.phase !== undefined) patch.phase = input.phase;
  if (input.cycle !== undefined) patch.cycle = input.cycle;
  if (input.status !== undefined) patch.status = input.status;
  if (input.briefThreadId !== undefined) {
    patch.briefThreadId = input.briefThreadId;
  }
  if (input.builderSessionId !== undefined) {
    patch.builderSessionId = input.builderSessionId;
  }
  if (input.buildPrompt !== undefined) patch.buildPrompt = input.buildPrompt;
  if (input.recordIntent !== undefined) {
    patch.recordIntent = input.recordIntent;
  }
  if (input.recordNotes !== undefined) patch.recordNotes = input.recordNotes;
  if (input.lastError !== undefined) patch.lastError = input.lastError;

  // Loop-back convenience: entering brief again without cycle bumps cycle.
  if (
    input.phase === "brief" &&
    existing.phase !== "brief" &&
    input.cycle === undefined
  ) {
    patch.cycle = existing.cycle + 1;
  }

  const [updated] = await db
    .update(taskAgentRuns)
    .set(patch)
    .where(
      and(
        eq(taskAgentRuns.workspaceId, workspaceId),
        eq(taskAgentRuns.id, runId),
      ),
    )
    .returning();

  if (!updated) return null;

  // Mirror Cursor session onto the task when set.
  if (
    input.builderSessionId !== undefined &&
    input.builderSessionId !== null
  ) {
    await db
      .update(tasks)
      .set({
        agentChatId: input.builderSessionId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.id, updated.taskId),
          isNull(tasks.deletedAt),
        ),
      );
  }

  const checks = await loadChecks(workspaceId, runId);
  return toRun(updated, checks);
}

export async function listTaskAgentRunChecks(
  workspaceId: string,
  runId: string,
): Promise<TaskAgentRunCheck[] | null> {
  const run = await getRunRow(workspaceId, runId);
  if (!run) return null;
  const rows = await loadChecks(workspaceId, runId);
  return rows.map(toCheck);
}

export async function createTaskAgentRunCheck(
  workspaceId: string,
  runId: string,
  input: CreateTaskAgentRunCheckInput,
): Promise<TaskAgentRunCheck | null> {
  const run = await getRunRow(workspaceId, runId);
  if (!run) return null;

  const key = input.key.trim();
  const label = input.label.trim();
  const now = new Date();
  const status = input.status ?? "pending";
  const startedAt = status === "running" ? now : null;
  const finishedAt =
    status === "pass" || status === "fail" || status === "skipped" ? now : null;

  const [created] = await db
    .insert(taskAgentRunChecks)
    .values({
      id: newId(),
      workspaceId,
      runId,
      key,
      label,
      status,
      detail: input.detail ?? null,
      logText: input.logText ?? null,
      sortOrder: input.sortOrder ?? 0,
      startedAt,
      finishedAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [taskAgentRunChecks.runId, taskAgentRunChecks.key],
      set: {
        label,
        status,
        detail: input.detail ?? null,
        logText: input.logText ?? null,
        sortOrder: input.sortOrder ?? 0,
        startedAt,
        finishedAt,
        updatedAt: now,
      },
    })
    .returning();

  return created ? toCheck(created) : null;
}

export async function updateTaskAgentRunCheck(
  workspaceId: string,
  runId: string,
  checkId: string,
  input: UpdateTaskAgentRunCheckInput,
): Promise<TaskAgentRunCheck | null> {
  const [existing] = await db
    .select()
    .from(taskAgentRunChecks)
    .where(
      and(
        eq(taskAgentRunChecks.workspaceId, workspaceId),
        eq(taskAgentRunChecks.runId, runId),
        eq(taskAgentRunChecks.id, checkId),
      ),
    )
    .limit(1);
  if (!existing) return null;

  const now = new Date();
  const patch: Partial<DbTaskAgentRunCheck> = { updatedAt: now };
  if (input.label !== undefined) patch.label = input.label.trim();
  if (input.detail !== undefined) patch.detail = input.detail;
  if (input.logText !== undefined) patch.logText = input.logText;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === "running" && !existing.startedAt) {
      patch.startedAt = now;
    }
    if (
      input.status === "pass" ||
      input.status === "fail" ||
      input.status === "skipped"
    ) {
      patch.finishedAt = now;
    }
  }

  const [updated] = await db
    .update(taskAgentRunChecks)
    .set(patch)
    .where(
      and(
        eq(taskAgentRunChecks.workspaceId, workspaceId),
        eq(taskAgentRunChecks.id, checkId),
        eq(taskAgentRunChecks.runId, runId),
      ),
    )
    .returning();

  return updated ? toCheck(updated) : null;
}
