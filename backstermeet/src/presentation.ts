export const PRESENTATION_KINDS = ["local", "screenshare"] as const;

export type PresentationKind = (typeof PRESENTATION_KINDS)[number];

/** How guests receive presentation content (portal stage). */
export type PresentationDeliveryMode = "iframe" | "viewport";

/** LiveKit participant attribute + data-channel keys for presentation sync. */
export const PRESENTATION_ATTR = {
  active: "bm.presentation",
  kind: "bm.presentationKind",
  mode: "bm.presentationMode",
  url: "bm.presentationUrl",
  viewport: "bm.presentationViewport",
} as const;

export type PresentationViewportPhase = "idle" | "preparing" | "live" | "error";

export const PRESENTATION_LABELS: Record<PresentationKind, string> = {
  local: "Local",
  screenshare: "Screenshare",
};

/** Fade out circle avatars / idle grid before the host camera slides in. */
export const HOST_AVATAR_FADE_MS = 300;
/** Fade out meeting details (idle calendar or presentation side panel). */
export const HOST_IDLE_DETAILS_FADE_MS = 280;
/** Host camera panel slide duration (matches --meet-stage-duration). */
export const HOST_CAMERA_SLIDE_MS = 640;

export function isPresentationKind(value: unknown): value is PresentationKind {
  return (
    typeof value === "string" &&
    (PRESENTATION_KINDS as readonly string[]).includes(value)
  );
}

export function isPresentationDeliveryMode(
  value: unknown,
): value is PresentationDeliveryMode {
  return value === "iframe" || value === "viewport";
}

/** Local → iframe on the portal; screenshare → viewport stream track. */
export function getPresentationDeliveryMode(
  kind: PresentationKind | null,
): PresentationDeliveryMode | null {
  if (!kind) return null;
  if (kind === "screenshare") return "viewport";
  if (kind === "local") return "iframe";
  return null;
}

export function presentationUsesUrlSync(kind: PresentationKind | null): boolean {
  return kind === "local";
}
