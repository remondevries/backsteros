import { useMemo } from "react";

import {
  extractMentionTokens,
  type ParsedMentionToken,
} from "./mention-tokens";
import { parseTaskSlug } from "./parse-task-slug";
import {
  formatTaskDisplayId,
  getTaskDisplayId,
  INBOX_TASK_KEY,
} from "./task-display-id";
import { TASK_LIST_SELECT } from "./task-list-query";
import { useLocalQuery } from "./use-local-query";

export type MentionCatalogTask = {
  id: string;
  displayId: string;
  title: string;
  status: string | null;
};

export type MentionCatalogProject = {
  id: string;
  key: string;
  name: string;
};

export type MobileMentionCatalog = {
  tasksByDisplayId: Map<string, MentionCatalogTask>;
  projectsByKey: Map<string, MentionCatalogProject>;
};

type SyncedTaskRow = {
  id: string;
  number: number | null;
  title: string | null;
  status: string | null;
  project_id: string | null;
  contact_id: string | null;
  project_key: string | null;
  inbox?: number | null;
};

type SyncedProjectRow = {
  id: string;
  key: string | null;
  name: string | null;
};

const TASKS_SQL = `SELECT
  t.id,
  t.number,
  t.title,
  t.status,
  t.project_id,
  t.contact_id,
  t.inbox,
  p.key AS project_key
FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id
 WHERE t.deleted_at IS NULL`;

const PROJECTS_SQL = `SELECT id, key, name FROM projects
 WHERE deleted_at IS NULL`;

const EMPTY_TASKS_SQL = `${TASK_LIST_SELECT} WHERE 0`;
const EMPTY_PROJECTS_SQL = `SELECT id, key, name FROM projects WHERE 0`;

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function nullIfEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function taskDisplayIdForRow(task: SyncedTaskRow): string | null {
  const number = coerceNumber(task.number);
  if (!number) return null;

  const projectKey = nullIfEmpty(task.project_key);
  const projectId = nullIfEmpty(task.project_id);
  const contactId = nullIfEmpty(task.contact_id);
  const isInbox = Number(task.inbox) === 1;

  // Inbox rows always get IN-N (desktop mapInboxTask parity).
  if (isInbox && !projectKey) {
    return formatTaskDisplayId(INBOX_TASK_KEY, number);
  }

  return getTaskDisplayId({ number, projectId, contactId }, projectKey);
}

function buildCatalog(
  tasks: readonly SyncedTaskRow[],
  projects: readonly SyncedProjectRow[],
): MobileMentionCatalog {
  const tasksByDisplayId = new Map<string, MentionCatalogTask>();
  for (const task of tasks) {
    const displayId = taskDisplayIdForRow(task);
    if (!displayId) continue;
    tasksByDisplayId.set(displayId.toLowerCase(), {
      id: task.id,
      displayId,
      title: task.title?.trim() || displayId,
      status: task.status,
    });
  }

  const projectsByKey = new Map<string, MentionCatalogProject>();
  for (const project of projects) {
    if (!project.key) continue;
    projectsByKey.set(project.key.toLowerCase(), {
      id: project.id,
      key: project.key,
      name: project.name?.trim() || project.key,
    });
  }

  return { tasksByDisplayId, projectsByKey };
}

/**
 * Stale inbox tokens: journal may still say `[@task:IN-N]` after the task was
 * moved into a project and renumbered/re-keyed. When IN-N is missing and exactly
 * one live task has that number, alias IN-N → that task.
 */
function applyStaleInboxAliases(
  catalog: MobileMentionCatalog,
  tasks: readonly SyncedTaskRow[],
  tokens: readonly ParsedMentionToken[],
): MobileMentionCatalog {
  const tasksByNumber = new Map<number, SyncedTaskRow[]>();
  for (const task of tasks) {
    const number = coerceNumber(task.number);
    if (!number) continue;
    const list = tasksByNumber.get(number) ?? [];
    list.push(task);
    tasksByNumber.set(number, list);
  }

  const tasksByDisplayId = new Map(catalog.tasksByDisplayId);

  for (const token of tokens) {
    if (token.kind !== "task") continue;
    const slug = parseTaskSlug(token.displayId);
    if (!slug || slug.contextKey !== INBOX_TASK_KEY) continue;
    const key = token.displayId.toLowerCase();
    if (tasksByDisplayId.has(key)) continue;

    const candidates = tasksByNumber.get(slug.number) ?? [];
    if (candidates.length !== 1) continue;

    const task = candidates[0]!;
    const currentDisplayId = taskDisplayIdForRow(task);
    if (!currentDisplayId) continue;

    const entry =
      tasksByDisplayId.get(currentDisplayId.toLowerCase()) ??
      ({
        id: task.id,
        displayId: currentDisplayId,
        title: task.title?.trim() || currentDisplayId,
        status: task.status,
      } satisfies MentionCatalogTask);

    tasksByDisplayId.set(key, entry);
  }

  return { ...catalog, tasksByDisplayId };
}

/** Resolve task/project mention chips for a markdown body. */
export function useMentionCatalogForBody(
  body: string | null,
): MobileMentionCatalog {
  const tokens = useMemo(
    () => extractMentionTokens(body ?? ""),
    [body],
  );
  const needsCatalog = tokens.some(
    (token) => token.kind === "task" || token.kind === "project",
  );

  const { data: syncedTasks } = useLocalQuery<SyncedTaskRow>(
    needsCatalog ? TASKS_SQL : EMPTY_TASKS_SQL,
  );
  const { data: syncedProjects } = useLocalQuery<SyncedProjectRow>(
    needsCatalog ? PROJECTS_SQL : EMPTY_PROJECTS_SQL,
  );

  return useMemo(() => {
    const tasks = syncedTasks ?? [];
    const projects = syncedProjects ?? [];
    const base = buildCatalog(tasks, projects);
    return applyStaleInboxAliases(base, tasks, tokens);
  }, [syncedProjects, syncedTasks, tokens]);
}

export function resolveMentionChip(
  token: ParsedMentionToken,
  catalog: MobileMentionCatalog,
): {
  label: string;
  deleted: boolean;
  taskId?: string;
  projectId?: string;
  status?: string | null;
} {
  if (token.kind === "task") {
    const task = catalog.tasksByDisplayId.get(token.displayId.toLowerCase());
    if (!task) {
      const slug = parseTaskSlug(token.displayId);
      return {
        label: slug
          ? formatTaskDisplayId(slug.contextKey, slug.number)
          : token.displayId,
        deleted: true,
      };
    }
    return {
      label: task.title,
      deleted: false,
      taskId: task.id,
      status: task.status,
    };
  }
  if (token.kind === "project") {
    const project = catalog.projectsByKey.get(token.key.toLowerCase());
    if (!project) {
      return { label: token.key, deleted: true };
    }
    return {
      label: project.name,
      deleted: false,
      projectId: project.id,
    };
  }
  if (token.kind === "letter") {
    return { label: token.displayId, deleted: true };
  }
  return {
    label: token.kind === "document" ? token.relativePath : token.key,
    deleted: true,
  };
}
