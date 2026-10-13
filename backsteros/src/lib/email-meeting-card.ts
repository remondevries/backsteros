/** Email thread MEETING_CARD fence helpers (display only). */

const MEETING_CARD_BLOCK = /```MEETING_CARD\s*\n([\s\S]*?)```/i;

/** Legacy plain markdown from the first composer/agent ship. */
const LEGACY_CREATED_AGENDA =
  /^Created agenda \*\*(.+?)\*\*\s*[·•]\s*\[Open\]\(([^)]+)\)\s*$/i;

export type EmailAgentMeetingCardPayload = {
  meetingId: string;
  title: string;
  href: string;
  displayId?: string | null;
  number?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  projectName?: string | null;
  projectIcon?: string | null;
  organizationName?: string | null;
  status?: string | null;
};

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

export function parseEmailAgentMeetingCard(
  body: string,
): { card: EmailAgentMeetingCardPayload; note: string } | null {
  const match = body.match(MEETING_CARD_BLOCK);
  if (match?.[1]) {
    try {
      const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
      const meetingId =
        typeof parsed.meetingId === "string" ? parsed.meetingId.trim() : "";
      const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
      const href = typeof parsed.href === "string" ? parsed.href.trim() : "";
      if (!meetingId || !title || !href) return null;
      const number =
        typeof parsed.number === "number" && Number.isFinite(parsed.number)
          ? Math.round(parsed.number)
          : null;
      const note = body
        .replace(MEETING_CARD_BLOCK, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return {
        card: {
          meetingId,
          title,
          href,
          displayId: asOptionalString(parsed.displayId),
          number,
          startAt:
            typeof parsed.startAt === "string" ? parsed.startAt : null,
          endAt: typeof parsed.endAt === "string" ? parsed.endAt : null,
          projectName: asOptionalString(parsed.projectName),
          projectIcon: asOptionalString(parsed.projectIcon),
          organizationName: asOptionalString(parsed.organizationName),
          status: asOptionalString(parsed.status),
        },
        note,
      };
    } catch {
      return null;
    }
  }

  const legacy = body.trim().match(LEGACY_CREATED_AGENDA);
  if (!legacy?.[1] || !legacy[2]) return null;
  const href = legacy[2].trim();
  const meetingId =
    new URLSearchParams(href.split("?")[1] ?? "").get("meeting")?.trim() ||
    href.match(/\/meetings\/([^/?#]+)/)?.[1]?.trim() ||
    "";
  if (!meetingId) return null;
  return {
    card: {
      meetingId,
      title: legacy[1].trim(),
      href,
    },
    note: "",
  };
}

export function formatEmailAgentMeetingCardComment(
  card: EmailAgentMeetingCardPayload,
  note?: string | null,
): string {
  const payload = {
    meetingId: card.meetingId,
    title: card.title,
    href: card.href,
    displayId: card.displayId ?? null,
    number: card.number ?? null,
    startAt: card.startAt ?? null,
    endAt: card.endAt ?? null,
    projectName: card.projectName ?? null,
    projectIcon: card.projectIcon ?? null,
    organizationName: card.organizationName ?? null,
    status: card.status ?? null,
  };
  const fence = `\`\`\`MEETING_CARD\n${JSON.stringify(payload)}\n\`\`\``;
  const extra = note?.trim();
  return extra ? `${fence}\n\n${extra}` : fence;
}
