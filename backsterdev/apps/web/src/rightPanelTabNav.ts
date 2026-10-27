/**
 * Pick the adjacent right-panel surface for Cmd/Ctrl+Shift+[ / ].
 * Wraps at the ends. Returns null when there is nothing to move to.
 */
export function resolveAdjacentRightPanelSurfaceId(input: {
  readonly surfaceIds: readonly string[];
  readonly activeSurfaceId: string | null;
  readonly direction: "previous" | "next";
}): string | null {
  const { surfaceIds, activeSurfaceId, direction } = input;
  if (surfaceIds.length < 2) return null;
  const currentIndex = activeSurfaceId
    ? surfaceIds.findIndex((id) => id === activeSurfaceId)
    : -1;
  const from = currentIndex >= 0 ? currentIndex : 0;
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = (from + delta + surfaceIds.length) % surfaceIds.length;
  return surfaceIds[nextIndex] ?? null;
}
