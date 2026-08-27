import { useRouter } from "expo-router";

import {
  getProjectAreaFilterLabel,
  PROJECT_AREA_FILTERS,
  type ProjectAreaFilter,
} from "../lib/project-areas";
import { PillNav } from "./pill-nav";
import { SectionListHeader } from "./section-list-header";

type Props = {
  area: ProjectAreaFilter;
  onAreaChange: (area: ProjectAreaFilter) => void;
};

/** Projects list header — area pills (Personal / Business / Clients). */
export function AreasHeader({ area, onAreaChange }: Props) {
  const router = useRouter();

  return (
    <SectionListHeader
      title="Projects"
      showGlobalSearch
      onPressPlus={() =>
        router.push({
          pathname: "/(app)/projects/new",
          params: { area },
        })
      }
      plusAccessibilityLabel="Create project"
      below={
        <PillNav
          accessibilityLabel="Project area"
          value={area}
          onChange={onAreaChange}
          items={PROJECT_AREA_FILTERS.map((value) => ({
            value,
            label: getProjectAreaFilterLabel(value),
          }))}
        />
      }
    />
  );
}
