/**
 * Decide whether a mention opens inside BacksterDEV or in BacksterOS desktop.
 *
 * - Codebase-project tasks → BacksterDEV task detail.
 * - Everything else (non-codebase tasks, letters, docs, contacts, …) → desktop
 *   via its internal path deep links (`/projects/…`, `/contacts/…`, …), opened
 *   through `~/.config/backsteros/open-href`.
 */

import { buildMentionDesktopHref, type MentionDesktopHrefInput } from "./mention-desktop-href";
import type { ParsedMentionToken } from "./mention-tokens";

export type MentionOpenTarget =
  | {
      kind: "backsterdev";
      taskId: string;
      projectId: string;
    }
  | {
      kind: "desktop";
      /** Desktop in-app path, e.g. `/projects/PF/tasks/pf-43`. */
      href: string;
    }
  | { kind: "none" };

export type MentionOpenTargetInput = {
  readonly token: ParsedMentionToken;
  /** When the mention resolved; null/undefined means unknown or deleted. */
  readonly resolved?: boolean;
  /** Task id from BacksterOS API when token is a task. */
  readonly taskId?: string | null;
  readonly projectId?: string | null;
  /** Project `type` from BacksterOS (`codebase`, `general`, …). */
  readonly projectType?: string | null;
  readonly desktopHrefInput?: Omit<MentionDesktopHrefInput, "token">;
};

export function decideMentionOpenTarget(input: MentionOpenTargetInput): MentionOpenTarget {
  const { token } = input;

  if (input.resolved === false) {
    return { kind: "none" };
  }

  if (token.kind === "task") {
    const taskId = input.taskId?.trim() || null;
    const projectId = input.projectId?.trim() || null;
    const projectType = input.projectType?.trim().toLowerCase() || null;

    if (taskId && projectId && projectType === "codebase") {
      return { kind: "backsterdev", taskId, projectId };
    }

    const href = buildMentionDesktopHref({
      token,
      ...input.desktopHrefInput,
    });
    if (href) return { kind: "desktop", href };
    return { kind: "none" };
  }

  // Non-task mentions always target desktop when we can build a path.
  const href = buildMentionDesktopHref({
    token,
    ...input.desktopHrefInput,
  });
  if (href) return { kind: "desktop", href };
  return { kind: "none" };
}
