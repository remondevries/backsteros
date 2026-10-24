/**
 * Self-reporting for control-API sessions: when a turn completes, blocks, or
 * errors, BacksterDEV posts a short BacksterOS task comment and (optionally)
 * fires an outbound webhook — so callers need not poll status.
 *
 * Webhook (off when URL unset):
 *   BACKSTEROS_CONTROL_REPORT_WEBHOOK_URL
 *   BACKSTEROS_CONTROL_REPORT_WEBHOOK_SECRET  → Authorization: Bearer <secret>
 *     (or full `Bearer …` / `Basic …` value as-is)
 *   Also read from `~/.config/backsteros/control-report.env` when unset in the process env.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { BacksterosControlSessionStatus } from "@t3tools/shared/backsterosTaskAutoPromote";

import {
  BACKSTEROS_FETCH_TIMEOUT_MS,
  resolveBacksterosControlApiKey,
  resolveBacksterosControlApiOrigin,
} from "./control-backsteros.ts";
import { authorizationHeaderFromWebhookKey } from "./file-task-callback.ts";

const execFileAsync = promisify(execFile);

export type ControlSessionReportState = "completed" | "blocked" | "error";

export type ControlSessionReportPayload = {
  readonly taskRef: string | null;
  readonly threadId: string | null;
  readonly state: ControlSessionReportState;
  readonly summary: string;
  readonly commits: readonly string[];
  readonly lastError: string | null;
  readonly at: string;
};

export type ControlSessionReportContext = {
  readonly sessionStatus?: string | null;
  readonly lastError?: string | null;
  readonly threadId?: string | null;
  readonly taskRef?: string | null;
  readonly backsterosProjectId?: string | null;
  readonly title?: string | null;
};

/** Dedup reports per task+state until the next working turn. */
const reportedKeys = new Set<string>();

const WEBHOOK_MAX_ATTEMPTS = 3;
const WEBHOOK_BACKOFF_MS = [250, 1_000, 3_000] as const;
const MAX_COMMITS = 8;
const MAX_SUMMARY_CHARS = 480;
const MAX_ERROR_CHARS = 400;

export function resetControlSessionReportStateForTests(): void {
  reportedKeys.clear();
}

export function resolveControlReportWebhookConfig(env: NodeJS.ProcessEnv = process.env): {
  readonly url: string | null;
  readonly secret: string | null;
} {
  // Only fall back to the home env file for the live process env — unit tests
  // pass an isolated object and must not pick up the developer's file.
  const fileEnv = env === process.env ? readControlReportEnvFile() : {};
  const url =
    asNonEmpty(env.BACKSTEROS_CONTROL_REPORT_WEBHOOK_URL) ??
    asNonEmpty(env.T3_CONTROL_SESSION_WEBHOOK_URL) ??
    asNonEmpty(fileEnv.BACKSTEROS_CONTROL_REPORT_WEBHOOK_URL);
  const secret =
    asNonEmpty(env.BACKSTEROS_CONTROL_REPORT_WEBHOOK_SECRET) ??
    asNonEmpty(env.T3_CONTROL_SESSION_WEBHOOK_SECRET) ??
    asNonEmpty(fileEnv.BACKSTEROS_CONTROL_REPORT_WEBHOOK_SECRET);
  return { url, secret };
}

/** Optional `~/.config/backsteros/control-report.env` (KEY=value lines). */
function readControlReportEnvFile(): Record<string, string> {
  try {
    const raw = readFileSync(join(homedir(), ".config", "backsteros", "control-report.env"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function asNonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Map a session lifecycle transition to a reportable terminal/blocked state.
 * Returns null for in-progress / uninteresting transitions.
 *
 * `failedToComplete` mirrors {@link controlSessionFailedToComplete} so this
 * module stays free of a circular import with the promote helper.
 */
export function controlSessionReportState(
  sessionStatus: BacksterosControlSessionStatus,
  options?: {
    readonly promotingToInReview?: boolean;
    readonly failedToComplete?: boolean;
  },
): ControlSessionReportState | null {
  if (options?.failedToComplete === true) return "error";
  if (sessionStatus === "blocked") return "blocked";
  if (sessionStatus === "done" || options?.promotingToInReview === true) return "completed";
  return null;
}

export function buildControlSessionReportSummary(input: {
  readonly state: ControlSessionReportState;
  readonly title?: string | null;
  readonly lastError?: string | null;
}): string {
  const title = input.title?.trim();
  const titleBit = title ? ` · ${truncate(title, 120)}` : "";
  if (input.state === "error") {
    const detail = input.lastError?.trim();
    return detail
      ? truncate(`Control session error${titleBit}: ${detail}`, MAX_SUMMARY_CHARS)
      : truncate(`Control session error${titleBit}.`, MAX_SUMMARY_CHARS);
  }
  if (input.state === "blocked") {
    return truncate(
      `Control session blocked (pending approval or user input)${titleBit}.`,
      MAX_SUMMARY_CHARS,
    );
  }
  return truncate(`Control session completed${titleBit}.`, MAX_SUMMARY_CHARS);
}

export function buildControlSessionReportCommentBody(
  payload: ControlSessionReportPayload,
): string {
  const lines: string[] = [
    `BacksterDEV control session · **${payload.state}**`,
    payload.summary,
  ];
  if (payload.commits.length > 0) {
    lines.push(`Commits: ${payload.commits.map((sha) => `\`${sha}\``).join(", ")}`);
  }
  if (payload.lastError?.trim()) {
    lines.push(`lastError: ${truncate(payload.lastError.trim(), MAX_ERROR_CHARS)}`);
  }
  return lines.join("\n");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function reportDedupeKey(taskId: string, state: ControlSessionReportState): string {
  return `${taskId}:${state}`;
}

/**
 * Clear report dedupe when a new turn starts so the next completed/blocked/error
 * can notify again.
 */
export function noteControlSessionReportWorking(taskId: string): void {
  reportedKeys.delete(reportDedupeKey(taskId, "completed"));
  reportedKeys.delete(reportDedupeKey(taskId, "blocked"));
  reportedKeys.delete(reportDedupeKey(taskId, "error"));
}

/**
 * Best-effort comment + webhook. Deduped per task+state until the next working
 * turn. Never throws to callers. Returns true when a report was scheduled.
 */
export function maybeReportControlSessionOutcome(
  taskId: string,
  sessionStatus: BacksterosControlSessionStatus,
  context?: ControlSessionReportContext | null,
  options?: {
    readonly promotingToInReview?: boolean;
    readonly failedToComplete?: boolean;
  },
): boolean {
  if (sessionStatus === "working") {
    noteControlSessionReportWorking(taskId);
  }
  const state = controlSessionReportState(sessionStatus, options);
  if (!state) return false;

  const key = reportDedupeKey(taskId, state);
  if (reportedKeys.has(key)) return false;
  reportedKeys.add(key);

  void runControlSessionReport(taskId, state, context ?? null).catch(() => undefined);
  return true;
}

async function runControlSessionReport(
  taskId: string,
  state: ControlSessionReportState,
  context: ControlSessionReportContext | null,
): Promise<void> {
  const lastError = context?.lastError?.trim() || null;
  const commits = await collectRecentCommitShas(context?.backsterosProjectId ?? null);
  const summary = buildControlSessionReportSummary({
    state,
    title: context?.title,
    lastError,
  });
  const payload: ControlSessionReportPayload = {
    taskRef: context?.taskRef?.trim() || null,
    threadId: context?.threadId?.trim() || null,
    state,
    summary,
    commits,
    lastError,
    at: new Date().toISOString(),
  };

  await postBacksterosControlTaskComment(taskId, buildControlSessionReportCommentBody(payload));
  await postControlSessionWebhook(payload);
}

export async function postBacksterosControlTaskComment(
  taskId: string,
  body: string,
): Promise<boolean> {
  const origin = resolveBacksterosControlApiOrigin();
  const apiKey = resolveBacksterosControlApiKey();
  if (!apiKey) return false;
  const trimmed = body.trim();
  if (!trimmed) return false;
  try {
    const response = await fetch(
      `${origin}/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: trimmed, activityActor: "agent" }),
        cache: "no-store",
        signal: AbortSignal.timeout(BACKSTEROS_FETCH_TIMEOUT_MS),
      },
    );
    return response.ok || response.status === 201;
  } catch {
    return false;
  }
}

export async function postControlSessionWebhook(
  payload: ControlSessionReportPayload,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const { url, secret } = resolveControlReportWebhookConfig(env);
  if (!url) return false;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (secret) {
    headers.Authorization = authorizationHeaderFromWebhookKey(secret);
  }

  const body = JSON.stringify(payload);
  for (let attempt = 0; attempt < WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(BACKSTEROS_FETCH_TIMEOUT_MS),
      });
      if (response.ok) return true;
    } catch {
      // retry
    }
    const delay = WEBHOOK_BACKOFF_MS[Math.min(attempt, WEBHOOK_BACKOFF_MS.length - 1)] ?? 3_000;
    await sleep(delay);
  }
  return false;
}

async function collectRecentCommitShas(backsterosProjectId: string | null): Promise<string[]> {
  if (!backsterosProjectId) return [];
  try {
    const origin = resolveBacksterosControlApiOrigin();
    const apiKey = resolveBacksterosControlApiKey();
    if (!apiKey) return [];
    const response = await fetch(
      `${origin}/api/v1/projects/${encodeURIComponent(backsterosProjectId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(BACKSTEROS_FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) return [];
    const project = (await response.json()) as { localWorkingDirectory?: string | null };
    const cwd = project.localWorkingDirectory?.trim();
    if (!cwd) return [];
    const { stdout } = await execFileAsync(
      "git",
      ["-C", cwd, "log", "-n", String(MAX_COMMITS), "--format=%h"],
      { timeout: 5_000, maxBuffer: 64 * 1024 },
    );
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, MAX_COMMITS);
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
