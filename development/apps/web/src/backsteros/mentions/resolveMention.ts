/**
 * Resolve mention tokens via the BacksterOS API for chip display + open targets.
 */

import { fetchBacksterosProject, fetchBacksterosTask } from "../client";
import type { BacksterosCodebaseProject, BacksterosTaskDetail } from "../types";
import { buildMentionDesktopHref } from "./mention-desktop-href";
import { decideMentionOpenTarget, type MentionOpenTarget } from "./mention-open-target";
import {
  getMentionTokenCacheKey,
  mentionTokenLabel,
  type ParsedMentionToken,
} from "./mention-tokens";

export type ResolvedMention = {
  readonly token: ParsedMentionToken;
  readonly deleted: boolean;
  readonly label: string;
  readonly title: string | null;
  readonly status: string | null;
  readonly displayId: string | null;
  readonly openTarget: MentionOpenTarget;
  readonly task: BacksterosTaskDetail | null;
  readonly codebaseProject: BacksterosCodebaseProject | null;
};

async function fetchTaskByMention(
  displayId: string,
  signal?: AbortSignal,
): Promise<BacksterosTaskDetail | null> {
  try {
    return await fetchBacksterosTask(displayId, signal);
  } catch {
    return null;
  }
}

async function fetchProjectType(
  projectIdOrKey: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const project = await fetchBacksterosProject(projectIdOrKey, signal);
    return typeof project.type === "string" ? project.type : null;
  } catch {
    return null;
  }
}

export async function resolveMentionToken(
  token: ParsedMentionToken,
  options?: {
    readonly signal?: AbortSignal;
    readonly codebaseProjects?: readonly BacksterosCodebaseProject[];
  },
): Promise<ResolvedMention> {
  const label = mentionTokenLabel(token);

  if (token.kind === "task") {
    const task = await fetchTaskByMention(token.displayId, options?.signal);
    if (!task || task.deletedAt) {
      return {
        token,
        deleted: true,
        label,
        title: null,
        status: null,
        displayId: token.displayId,
        openTarget: { kind: "none" },
        task: null,
        codebaseProject: null,
      };
    }

    const projectKey = task.projectKey ?? null;
    const projectId = task.projectId;
    const codebaseProject =
      options?.codebaseProjects?.find(
        (project) =>
          project.id === projectId ||
          (project.key != null &&
            projectKey != null &&
            project.key.toLowerCase() === projectKey.toLowerCase()),
      ) ?? null;

    let projectType = codebaseProject?.type ?? null;
    if (!projectType && projectId) {
      projectType = await fetchProjectType(projectId, options?.signal);
    } else if (!projectType && projectKey) {
      projectType = await fetchProjectType(projectKey, options?.signal);
    }

    const openTarget = decideMentionOpenTarget({
      token,
      resolved: true,
      taskId: task.id,
      projectId,
      projectType,
      desktopHrefInput: {
        task: {
          number: task.number,
          projectKey,
          id: task.id,
        },
      },
    });

    return {
      token,
      deleted: false,
      label: task.title?.trim() || label,
      title: task.title?.trim() || null,
      status: task.status,
      displayId: task.key ?? token.displayId,
      openTarget,
      task,
      codebaseProject,
    };
  }

  // Non-task: build a desktop deep link from the token alone; treat as resolved
  // for open purposes (desktop handles missing entities).
  const href = buildMentionDesktopHref({ token });
  return {
    token,
    deleted: false,
    label,
    title: null,
    status: null,
    displayId: "displayId" in token ? token.displayId : "key" in token ? token.key : null,
    openTarget: href ? { kind: "desktop", href } : { kind: "none" },
    task: null,
    codebaseProject: null,
  };
}

export async function resolveMentionTokens(
  tokens: readonly ParsedMentionToken[],
  options?: {
    readonly signal?: AbortSignal;
    readonly codebaseProjects?: readonly BacksterosCodebaseProject[];
  },
): Promise<ReadonlyMap<string, ResolvedMention>> {
  const entries = await Promise.all(
    tokens.map(async (token) => {
      const resolved = await resolveMentionToken(token, options);
      return [getMentionTokenCacheKey(token), resolved] as const;
    }),
  );
  return new Map(entries);
}
