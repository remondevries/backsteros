/** Native / module callers dispatch this; `AppToastHost` renders it. */
export const APP_TOAST_EVENT = "backsteros:app-toast";

export type AppToastDetail = {
  message: string;
  /** Auto-dismiss after this many ms. Defaults to 1800. */
  durationMs?: number;
};

export function showAppToast(detail: AppToastDetail | string): void {
  if (typeof window === "undefined") return;
  const next: AppToastDetail =
    typeof detail === "string" ? { message: detail } : detail;
  const message = next.message.trim();
  if (!message) return;
  window.dispatchEvent(
    new CustomEvent(APP_TOAST_EVENT, {
      detail: {
        message,
        durationMs: next.durationMs,
      } satisfies AppToastDetail,
    }),
  );
}
