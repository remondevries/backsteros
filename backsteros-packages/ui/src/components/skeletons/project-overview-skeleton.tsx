import { SkeletonBlock } from "./skeleton-block.js";

function OverviewMetaPill({ className = "" }: { className?: string }) {
  return (
    <SkeletonBlock
      as="span"
      className={["project-overview-skeleton-pill", className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

/**
 * Project overview loading state: icon + title + summary, property pills,
 * and description body — matching the ready overview panel layout.
 */
export function ProjectOverviewSkeleton() {
  return (
    <article
      className="project-overview-skeleton"
      aria-busy="true"
      aria-label="Loading project overview"
    >
      <div className="project-overview-skeleton__top">
        <header className="project-overview-skeleton__header">
          <SkeletonBlock className="project-overview-skeleton-icon" />
          <SkeletonBlock className="project-overview-skeleton-title" />
          <SkeletonBlock className="project-overview-skeleton-summary" />
        </header>

        <section className="project-overview-skeleton__meta" aria-hidden="true">
          <div className="project-overview-skeleton__meta-row">
            <span className="project-overview-skeleton__meta-label">
              Properties
            </span>
            <div className="project-overview-skeleton__pills">
              <OverviewMetaPill className="project-overview-skeleton-pill--sm" />
              <OverviewMetaPill className="project-overview-skeleton-pill--md" />
              <OverviewMetaPill className="project-overview-skeleton-pill--sm" />
              <OverviewMetaPill className="project-overview-skeleton-pill--lg" />
              <OverviewMetaPill className="project-overview-skeleton-pill--xl" />
              <OverviewMetaPill className="project-overview-skeleton-pill--xs" />
            </div>
          </div>

          <div className="project-overview-skeleton__meta-row">
            <span className="project-overview-skeleton__meta-label">Areas</span>
            <div className="project-overview-skeleton__pills">
              <OverviewMetaPill className="project-overview-skeleton-pill--area" />
            </div>
          </div>
        </section>
      </div>

      <section className="project-overview-skeleton__description">
        <div className="project-overview-skeleton__description-label-wrap">
          <span className="project-overview-skeleton__description-label">
            Description
            <span aria-hidden="true"> ▾</span>
          </span>
        </div>

        <div className="project-overview-skeleton__lines">
          <SkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--wide" />
          <SkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--a" />
          <SkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--b" />
          <SkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--c" />
          <SkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--d" />
          <SkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--e" />
        </div>
      </section>
    </article>
  );
}
