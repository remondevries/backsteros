/** Matches `.email-thread` max-width (56rem). */
export const EMAIL_THREAD_CONTENT_MAX_WIDTH = 896;

export const EMAIL_THREAD_MINIMAP_ITEM_SPACING = 8;
export const EMAIL_THREAD_MINIMAP_MIN_ITEMS = 2;
export const EMAIL_THREAD_MINIMAP_MAX_HEIGHT_CSS = "calc(100% - 2rem)";
export const EMAIL_THREAD_MINIMAP_PERSISTENT_GUTTER = 48;
export const EMAIL_THREAD_MINIMAP_HIT_STRIP_LEFT = 12;
export const EMAIL_THREAD_MINIMAP_HIT_STRIP_MAX_WIDTH = 40;
export const EMAIL_THREAD_MINIMAP_EXPANDED_HIT_STRIP_WIDTH = "18rem";

export type EmailThreadMinimapDirection = "sent" | "received";

export type EmailThreadMinimapItem = {
  readonly id: string;
  readonly subject: string | null;
  readonly preview: string | null;
  readonly direction: EmailThreadMinimapDirection;
};

export type EmailThreadMinimapMessageInput = {
  readonly messageId: string;
  readonly subject?: string | null;
  readonly from?: string | null;
  readonly to?: readonly string[] | null;
  readonly direction: EmailThreadMinimapDirection;
};

export function emailThreadMinimapSectionId(messageId: string): string {
  return messageId.trim();
}

export function compactEmailMinimapPreview(
  text: string | null | undefined,
): string | null {
  const compact = text?.replace(/\s+/g, " ").trim() ?? "";
  return compact.length > 0 ? compact : null;
}

/** One tick per real thread email (sent / received) — not comments or drafts. */
export function deriveEmailThreadMinimapItems(
  messages: readonly EmailThreadMinimapMessageInput[],
): EmailThreadMinimapItem[] {
  const items: EmailThreadMinimapItem[] = [];
  for (const message of messages) {
    const id = emailThreadMinimapSectionId(message.messageId);
    if (!id) continue;
    const subject = compactEmailMinimapPreview(message.subject);
    const counterpart =
      message.direction === "sent"
        ? compactEmailMinimapPreview(
            (message.to ?? []).filter(Boolean).join(", "),
          )
        : compactEmailMinimapPreview(message.from);
    const preview =
      message.direction === "sent"
        ? counterpart
          ? `To ${counterpart}`
          : "Sent"
        : counterpart
          ? `From ${counterpart}`
          : "Received";
    items.push({
      id,
      subject,
      preview,
      direction: message.direction,
    });
  }
  return items;
}

export function resolveEmailThreadMinimapHeightStyle(
  itemCount: number,
): string {
  const naturalHeight = Math.max(
    1,
    (itemCount - 1) * EMAIL_THREAD_MINIMAP_ITEM_SPACING,
  );
  return `min(${naturalHeight}px, ${EMAIL_THREAD_MINIMAP_MAX_HEIGHT_CSS})`;
}

export function resolveEmailThreadMinimapTopPercent(
  index: number,
  itemCount: number,
): number {
  if (itemCount <= 1) return 0;
  return (Math.max(0, Math.min(index, itemCount - 1)) / (itemCount - 1)) * 100;
}

export function resolveEmailThreadMinimapIndexFromPointer(input: {
  readonly itemCount: number;
  readonly railTop: number;
  readonly railHeight: number;
  readonly pointerY: number;
}): number | null {
  if (input.itemCount <= 0 || input.railHeight <= 0) return null;
  if (input.itemCount === 1) return 0;
  const progress = Math.max(
    0,
    Math.min(1, (input.pointerY - input.railTop) / input.railHeight),
  );
  return Math.max(
    0,
    Math.min(input.itemCount - 1, Math.round(progress * (input.itemCount - 1))),
  );
}

export function resolveEmailThreadMinimapHasPersistentGutter(
  viewportWidth: number,
  contentMaxWidth = EMAIL_THREAD_CONTENT_MAX_WIDTH,
): boolean {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return false;
  const contentWidth = Math.min(viewportWidth, contentMaxWidth);
  const sideGutter = Math.max(0, (viewportWidth - contentWidth) / 2);
  return sideGutter >= EMAIL_THREAD_MINIMAP_PERSISTENT_GUTTER;
}

export function resolveEmailThreadMinimapHitStripWidth(
  viewportWidth: number,
  contentMaxWidth = EMAIL_THREAD_CONTENT_MAX_WIDTH,
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0;
  const contentWidth = Math.min(viewportWidth, contentMaxWidth);
  const sideGutter = Math.max(0, (viewportWidth - contentWidth) / 2);
  return Math.max(
    0,
    Math.min(
      EMAIL_THREAD_MINIMAP_HIT_STRIP_MAX_WIDTH,
      Math.floor(sideGutter) - EMAIL_THREAD_MINIMAP_HIT_STRIP_LEFT,
    ),
  );
}

export function resolveEmailThreadMinimapInteractiveWidth(
  collapsedWidth: number,
  expanded: boolean,
): number | string {
  return expanded
    ? EMAIL_THREAD_MINIMAP_EXPANDED_HIT_STRIP_WIDTH
    : collapsedWidth;
}

export function emailThreadMinimapEventTargetsPreview(
  target: EventTarget,
): boolean {
  return (
    target instanceof Element &&
    target.closest("[data-email-minimap-preview]") !== null
  );
}
