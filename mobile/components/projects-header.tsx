import { useRouter } from "expo-router";

import type { ListBoardView } from "../lib/list-board-view";
import {
  getProjectAreaFilterLabel,
  PROJECT_AREA_FILTERS,
  type ProjectAreaFilter,
} from "../lib/project-areas";
import { ListBoardToggle } from "./list-board-toggle";
import { PillNav } from "./pill-nav";
import { SectionListHeader } from "./section-list-header";

type Props = {
  area: ProjectAreaFilter;
  onAreaChange: (area: ProjectAreaFilter) => void;
  boardView?: ListBoardView;
  onBoardViewToggle?: () => void;
};

export function ProjectsHeader({
  area,
  onAreaChange,
  boardView,
  onBoardViewToggle,
}: Props) {
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
      trailingControl={
        boardView && onBoardViewToggle ? (
          <ListBoardToggle view={boardView} onToggle={onBoardViewToggle} />
        ) : null
      }
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
