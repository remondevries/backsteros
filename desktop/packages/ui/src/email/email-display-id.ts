export const EMAIL_DISPLAY_KEY = "E";

export function formatEmailDisplayId(emailNumber: number): string {
  return `${EMAIL_DISPLAY_KEY}-${emailNumber}`;
}

export function parseEmailDisplayId(displayId: string): number | null {
  const match = displayId.trim().match(/^E-(\d+)$/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
