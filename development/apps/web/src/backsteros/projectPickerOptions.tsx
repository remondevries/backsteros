import { DefaultProjectIcon } from "./DefaultProjectIcon";
import { BacksterosProjectStatusIcon } from "./ProjectStatusIcon";
import { filterBacksterosProjectsForDefaultPicker } from "./projectStatus";
import type { BacksterosSearchablePropertyOption } from "./SearchablePropertyMenu";
import type { BacksterosCodebaseProject } from "./types";

const NO_PROJECT_VALUE = "__no_project__";

export function buildBacksterosProjectPickerOptions(
  projects: readonly BacksterosCodebaseProject[],
  options?: {
    readonly keepIds?: readonly (string | null | undefined)[];
    readonly includeNone?: boolean;
    readonly noneValue?: string;
    readonly noneLabel?: string;
    readonly noneSearchText?: string;
  },
): BacksterosSearchablePropertyOption[] {
  const visible = filterBacksterosProjectsForDefaultPicker(projects, {
    keepIds: options?.keepIds ?? [],
  });
  const rows: BacksterosSearchablePropertyOption[] = visible.map((entry, index) => {
    const row: BacksterosSearchablePropertyOption = {
      value: entry.id,
      label: entry.name,
      searchText: [entry.name, entry.key].filter(Boolean).join(" "),
      icon: <BacksterosProjectStatusIcon status={entry.status} size={14} className="shrink-0" />,
    };
    if (options?.includeNone && index === 0) {
      return { ...row, separatorBefore: true };
    }
    return row;
  });
  if (!options?.includeNone) return rows;
  return [
    {
      value: options.noneValue ?? NO_PROJECT_VALUE,
      label: options.noneLabel ?? "No project",
      searchText: options.noneSearchText ?? "none clear unassigned inbox",
      icon: <DefaultProjectIcon size={14} className="shrink-0 opacity-70" />,
    },
    ...rows,
  ];
}
