/** Email thread TASK_CARD fence helpers (display only — no Agent Chat). */

const TASK_CARD_BLOCK = /```TASK_CARD\s*\n([\s\S]*?)```/i;

export type EmailAgentTaskCardPayload = {
  taskId: string;
  number: number | null;
  title: string;
  displayId?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  projectIcon?: string | null;
  dueDate?: string | null;
  status?: string | null;
  priority?: number | null;
  href: string;
};

export function parseEmailAgentTaskCard(
  body: string,
): { card: EmailAgentTaskCardPayload; note: string } | null {
  const match = body.match(TASK_CARD_BLOCK);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
    const taskId = typeof parsed.taskId === "string" ? parsed.taskId.trim() : "";
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const href = typeof parsed.href === "string" ? parsed.href.trim() : "";
    if (!taskId || !title || !href) return null;
    const number =
      typeof parsed.number === "number" && Number.isFinite(parsed.number)
        ? Math.round(parsed.number)
        : null;
    const priorityRaw = parsed.priority;
    const priority =
      typeof priorityRaw === "number" && Number.isFinite(priorityRaw)
        ? Math.max(0, Math.min(4, Math.round(priorityRaw)))
        : null;
    const note = body
      .replace(TASK_CARD_BLOCK, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return {
      card: {
        taskId,
        number,
        title,
        displayId:
          typeof parsed.displayId === "string"
            ? parsed.displayId.trim() || null
            : null,
        projectKey:
          typeof parsed.projectKey === "string"
            ? parsed.projectKey.trim() || null
            : null,
        projectName:
          typeof parsed.projectName === "string"
            ? parsed.projectName.trim() || null
            : null,
        projectIcon:
          typeof parsed.projectIcon === "string"
            ? parsed.projectIcon.trim() || null
            : null,
        dueDate: typeof parsed.dueDate === "string" ? parsed.dueDate : null,
        status:
          typeof parsed.status === "string"
            ? parsed.status.trim() || null
            : null,
        priority,
        href,
      },
      note,
    };
  } catch {
    return null;
  }
}

export function formatEmailAgentTaskCardComment(
  card: EmailAgentTaskCardPayload,
  note?: string | null,
): string {
  const payload = {
    taskId: card.taskId,
    number: card.number,
    title: card.title,
    displayId: card.displayId ?? null,
    projectKey: card.projectKey ?? null,
    projectName: card.projectName ?? null,
    projectIcon: card.projectIcon ?? null,
    dueDate: card.dueDate ?? null,
    status: card.status ?? null,
    priority: card.priority ?? null,
    href: card.href,
  };
  const fence = `\`\`\`TASK_CARD\n${JSON.stringify(payload)}\n\`\`\``;
  const extra = note?.trim();
  return extra ? `${fence}\n\n${extra}` : fence;
}
