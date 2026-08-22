export type EmailThreadBodyViewMode = "plain" | "rendered" | "source";

export const EMAIL_THREAD_BODY_VIEW_MODE_LABELS: Record<
  EmailThreadBodyViewMode,
  string
> = {
  rendered: "Rendered",
  plain: "Plain Text",
  source: "Source",
};

export const EMAIL_THREAD_BODY_VIEW_MODES: readonly EmailThreadBodyViewMode[] =
  ["rendered", "plain", "source"];

const DEFAULT_EMAIL_THREAD_BODY_VIEW_MODE: EmailThreadBodyViewMode = "plain";

let rememberedBodyViewMode: EmailThreadBodyViewMode =
  DEFAULT_EMAIL_THREAD_BODY_VIEW_MODE;

export function rememberEmailThreadBodyViewMode(
  mode: EmailThreadBodyViewMode,
): void {
  rememberedBodyViewMode = mode;
}

export function getRememberedEmailThreadBodyViewMode(): EmailThreadBodyViewMode {
  return rememberedBodyViewMode;
}
