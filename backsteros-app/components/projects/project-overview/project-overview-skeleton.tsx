"use client";

function OverviewSkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      className={[
        "project-overview-skeleton-block inline-block shrink-0 bg-white/10 animate-pulse",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}

function OverviewMetaPill({ className }: { className?: string }) {
  return (
    <OverviewSkeletonBlock
      className={[
        "project-overview-skeleton-pill h-[26px] rounded-full",
        className,
      ]
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
      className="mx-auto flex h-full min-h-0 w-full flex-1 flex-col items-stretch overflow-hidden text-foreground"
      aria-busy="true"
      aria-label="Loading project overview"
    >
      <div className="flex shrink-0 flex-col items-stretch">
        <header className="mx-auto flex w-full max-w-[800px] flex-col gap-2 px-4 pt-6">
          <OverviewSkeletonBlock className="project-overview-skeleton-icon size-8 rounded-lg" />
          <OverviewSkeletonBlock className="project-overview-skeleton-title h-[26px] w-[min(58%,18rem)] rounded-lg" />
          <OverviewSkeletonBlock className="project-overview-skeleton-summary h-4 w-[min(78%,24rem)] rounded-md" />
        </header>

        <section
          className="mx-auto flex w-full max-w-[800px] flex-col gap-4 px-4 pt-8"
          aria-hidden="true"
        >
          <div className="flex min-w-0 items-center gap-1.5 max-md:flex-col max-md:items-start">
            <span className="w-[72px] shrink-0 text-sm leading-[18px] text-foreground/50 max-md:w-auto">
              Properties
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 max-md:w-full">
              <OverviewMetaPill className="w-14" />
              <OverviewMetaPill className="w-[5.5rem]" />
              <OverviewMetaPill className="w-16" />
              <OverviewMetaPill className="w-[7.5rem]" />
              <OverviewMetaPill className="w-[9.5rem]" />
              <OverviewMetaPill className="w-12" />
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 max-md:flex-col max-md:items-start">
            <span className="w-[72px] shrink-0 text-sm leading-[18px] text-foreground/50 max-md:w-auto">
              Areas
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <OverviewMetaPill className="w-[4.75rem]" />
            </div>
          </div>
        </section>
      </div>

      <section className="flex min-h-0 w-full flex-1 flex-col pt-6">
        <div className="mx-auto w-full max-w-[800px] shrink-0 px-4">
          <span className="inline-flex items-center gap-1.5 py-0.5 pr-1.5 text-sm leading-[18px] text-foreground/50">
            Description
            <span aria-hidden="true" className="text-foreground/50">
              ▾
            </span>
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-[800px] flex-1 flex-col gap-3 px-4 pt-4 pb-8">
          <OverviewSkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--wide h-3 w-[94%] rounded-md" />
          <OverviewSkeletonBlock className="project-overview-skeleton-line h-3 w-[78%] rounded-md opacity-70" />
          <OverviewSkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--medium h-3 w-[64%] rounded-md opacity-45" />
          <OverviewSkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--short h-3 w-[42%] rounded-md opacity-25" />
          <OverviewSkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--wide mt-2 h-3 w-[88%] rounded-md opacity-35" />
          <OverviewSkeletonBlock className="project-overview-skeleton-line project-overview-skeleton-line--medium h-3 w-[56%] rounded-md opacity-18" />
        </div>
      </section>
    </article>
  );
}
