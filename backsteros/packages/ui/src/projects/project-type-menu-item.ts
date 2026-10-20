import type { EntityExtraMenuItem } from "../components/entity-actions/entity-header-actions-context.js";
import {
  getProjectTypeLabel,
  migrateLegacyProjectType,
  PROJECT_TYPE_ORDER,
  type ProjectType,
} from "./project-type.js";

/**
 * ⋯ menu entry that drills into project type choices (Duplicate / Delete siblings).
 */
export function buildProjectTypeExtraMenuItem(
  currentType: string | null | undefined,
  onTypeChange: (type: ProjectType) => void,
): EntityExtraMenuItem {
  const projectType = migrateLegacyProjectType(currentType);
  return {
    id: "project-type",
    label: "Type",
    trailingLabel: getProjectTypeLabel(projectType),
    submenu: PROJECT_TYPE_ORDER.map((value) => ({
      id: `project-type-${value}`,
      label: getProjectTypeLabel(value),
      selected: value === projectType,
      onSelect: () => {
        if (value !== projectType) {
          onTypeChange(value);
        }
      },
    })),
    onSelect: () => undefined,
  };
}
