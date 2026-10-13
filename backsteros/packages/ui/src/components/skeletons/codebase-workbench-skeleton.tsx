import { SkeletonBlock } from "./skeleton-block.js";

/** Codebase workbench — tree + main pane split. */
export function CodebaseWorkbenchSkeleton() {
  return (
    <div className="codebase-workbench-skeleton" aria-hidden="true">
      <div className="codebase-workbench-skeleton__tree">
        {Array.from({ length: 10 }, (_, index) => (
          <div
            key={index}
            className="codebase-workbench-skeleton__tree-indent"
            style={{ paddingLeft: `${(index % 3) * 12}px` }}
          >
            <SkeletonBlock className="codebase-workbench-skeleton__tree-row" />
          </div>
        ))}
      </div>
      <div className="codebase-workbench-skeleton__main">
        <SkeletonBlock className="codebase-workbench-skeleton__toolbar" />
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonBlock
            key={index}
            className="codebase-workbench-skeleton__line"
          />
        ))}
      </div>
    </div>
  );
}
