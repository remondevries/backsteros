import { ProjectsListSkeleton } from "./projects-list-skeleton.js";
import { SkeletonBlock } from "./skeleton-block.js";

/** Areas list — same board layout as projects with an areas filter row. */
export function AreasListSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
      <div className="areas-list-skeleton__filter" aria-hidden="true">
        <SkeletonBlock className="areas-list-skeleton__filter-pill" />
        <SkeletonBlock className="areas-list-skeleton__filter-pill areas-list-skeleton__filter-pill--sm" />
      </div>
      <ProjectsListSkeleton />
    </div>
  );
}
