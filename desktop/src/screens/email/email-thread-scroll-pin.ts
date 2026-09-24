/**
 * Keep `.email-detail-scrollport` still across focus / dock-layout changes
 * (Preview ↔ Edit, New Task / Agenda, CodeMirror autofocus).
 */

/** Re-apply scrollTop after layout; returns cancel for effect cleanup. */
export function scheduleEmailThreadScrollRestore(
  getScroller: () => HTMLElement | null,
  top: number,
): () => void {
  let cancelled = false;
  const restore = () => {
    if (cancelled) return;
    const el = getScroller();
    if (el) el.scrollTop = top;
  };
  restore();

  const rafIds: number[] = [];
  rafIds.push(
    globalThis.requestAnimationFrame(() => {
      restore();
      rafIds.push(globalThis.requestAnimationFrame(restore));
    }),
  );
  // Dock clearance / CM height can settle after first paint.
  const timers = [48, 120, 240].map((ms) =>
    globalThis.setTimeout(restore, ms),
  );

  return () => {
    cancelled = true;
    for (const id of rafIds) globalThis.cancelAnimationFrame(id);
    for (const timer of timers) globalThis.clearTimeout(timer);
  };
}

/** Capture scrollTop, run `update`, then chase-restore (fire-and-forget). */
export function pinEmailThreadScrollDuringUpdate(run: () => void): void {
  const scroller =
    typeof document !== "undefined"
      ? document.querySelector<HTMLElement>(".email-detail-scrollport")
      : null;
  const top = scroller?.scrollTop ?? null;
  run();
  if (!scroller || top == null) return;
  scheduleEmailThreadScrollRestore(() => scroller, top);
}
