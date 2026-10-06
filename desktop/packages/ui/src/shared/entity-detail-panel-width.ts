/** Shared clamp + default width for contact/org/domain profile rails. */
export const ENTITY_DETAIL_PANEL_MIN_WIDTH_PX = 260;
export const ENTITY_DETAIL_PANEL_MAX_WIDTH_PX = 480;

/** Default open width when nothing is stored — 30% of the content row. */
export const ENTITY_DETAIL_PANEL_WIDTH_RATIO = 0.3;

export function clampEntityDetailPanelWidth(
  width: number,
  parentContentWidthPx: number,
): number {
  const ratioCap =
    parentContentWidthPx > 0
      ? Math.round(parentContentWidthPx * 0.55)
      : ENTITY_DETAIL_PANEL_MAX_WIDTH_PX;
  const max = Math.min(
    ENTITY_DETAIL_PANEL_MAX_WIDTH_PX,
    Math.max(ENTITY_DETAIL_PANEL_MIN_WIDTH_PX, ratioCap),
  );
  return Math.min(max, Math.max(ENTITY_DETAIL_PANEL_MIN_WIDTH_PX, width));
}

export function defaultEntityDetailPanelWidthPx(
  parentContentWidthPx: number,
): number {
  if (parentContentWidthPx <= 0) {
    return 320;
  }
  return clampEntityDetailPanelWidth(
    Math.round(parentContentWidthPx * ENTITY_DETAIL_PANEL_WIDTH_RATIO),
    parentContentWidthPx,
  );
}
