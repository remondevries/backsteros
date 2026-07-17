import {
  PROJECT_LIST_GRID_CLASS,
  PROJECT_LIST_HEADER_CELL_CLASS,
} from "@/lib/projects-list-columns";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";

export function ProjectsListHeader() {
  if (isMobileShellBuildActive()) {
    return null;
  }

  return (
    <div
      className={`${PROJECT_LIST_GRID_CLASS} sticky top-0 z-20 py-2`}
      role="row"
    >
      <span className={`${PROJECT_LIST_HEADER_CELL_CLASS} min-w-0`}>Name</span>
      <span className={`${PROJECT_LIST_HEADER_CELL_CLASS} text-center`}>
        Health
      </span>
      <span className={`${PROJECT_LIST_HEADER_CELL_CLASS} text-center`}>
        Priority
      </span>
      <span className={`${PROJECT_LIST_HEADER_CELL_CLASS}`}>Dates</span>
      <span className={`${PROJECT_LIST_HEADER_CELL_CLASS} text-center`}>
        Issues
      </span>
      <span className={`${PROJECT_LIST_HEADER_CELL_CLASS} text-right`}>
        Status
      </span>
    </div>
  );
}
