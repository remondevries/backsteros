import {
  ENTITY_ICON_COLOR_PRESETS,
  isValidEntityIconColor,
} from "../entity/entity-icon.js";

/** Preset colors for CRM group dots (same palette as entity icons). */
export const CRM_GROUP_COLOR_PRESETS = ENTITY_ICON_COLOR_PRESETS;

export const DEFAULT_CRM_GROUP_COLOR: string = CRM_GROUP_COLOR_PRESETS[3]!;

export function resolveCrmGroupColor(
  color: string | null | undefined,
): string {
  if (color && isValidEntityIconColor(color)) return color;
  return DEFAULT_CRM_GROUP_COLOR;
}

export function nextCrmGroupPresetColor(existingCount = 0): string {
  return (
    CRM_GROUP_COLOR_PRESETS[existingCount % CRM_GROUP_COLOR_PRESETS.length] ??
    DEFAULT_CRM_GROUP_COLOR
  );
}
