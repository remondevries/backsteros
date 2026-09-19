import { useMemo } from "react";

import { resolveCrmGroupColor, TaskLabelColorDot } from "@backsteros/ui";

import { orderTaskLabelsForDropdown } from "./task-label-dropdown-order";
import { useTaskLabels } from "./use-task-labels";

/** Label dropdown options with the color dot for each label. */
export function useTaskLabelDropdownOptions() {
  const catalog = useTaskLabels();
  const options = useMemo(
    () =>
      orderTaskLabelsForDropdown(catalog.labels).map((label) => ({
        value: label.id,
        label: label.name,
        ...(label.group ? { group: label.group } : {}),
        searchTerms: label.group
          ? `${label.group} ${label.name}`
          : label.name,
        icon: (
          <TaskLabelColorDot
            color={resolveCrmGroupColor(label.color)}
            size={10}
          />
        ),
      })),
    [catalog.labels],
  );
  return options;
}
