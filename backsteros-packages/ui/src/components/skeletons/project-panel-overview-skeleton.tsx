import { SkeletonBlock } from "./skeleton-block.js";

/**
 * Loading placeholder for `ProjectPanelDetailView` (console / narrow panel):
 * Repositories fills the height; Description and Properties sit collapsed below.
 */
export function ProjectPanelOverviewSkeleton() {
  return (
    <div
      className="project-panel-overview-skeleton"
      aria-busy="true"
      aria-label="Loading project"
    >
      <div
        className="project-panel-accordion project-panel-overview-skeleton__accordion"
        aria-hidden="true"
      >
        <section className="project-panel-block project-panel-block--fill project-panel-block--expanded">
          <div className="project-panel-block__header project-panel-block__header--static">
            <span className="project-panel-block__title">Repositories</span>
            <span className="project-panel-block__chevron" aria-hidden="true">
              ▾
            </span>
          </div>
          <div className="project-panel-block__body">
            <div className="project-panel-overview-skeleton__repos">
              <div className="project-panel-overview-skeleton__toolbar">
                <SkeletonBlock className="project-panel-overview-skeleton__chip project-panel-overview-skeleton__chip--repo" />
                <SkeletonBlock className="project-panel-overview-skeleton__chip project-panel-overview-skeleton__chip--branch" />
              </div>
              <SkeletonBlock className="project-panel-overview-skeleton__toggle" />
              <ul className="project-panel-overview-skeleton__commits">
                {Array.from({ length: 8 }, (_, index) => (
                  <li
                    key={index}
                    className="project-panel-overview-skeleton__commit"
                  >
                    <SkeletonBlock className="project-panel-overview-skeleton__sha" />
                    <div className="project-panel-overview-skeleton__commit-body">
                      <SkeletonBlock
                        className={[
                          "project-panel-overview-skeleton__commit-message",
                          index % 3 === 1
                            ? "project-panel-overview-skeleton__commit-message--mid"
                            : null,
                          index % 3 === 2
                            ? "project-panel-overview-skeleton__commit-message--short"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      />
                      <SkeletonBlock className="project-panel-overview-skeleton__commit-meta" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="project-panel-block">
          <div className="project-panel-block__header project-panel-block__header--static">
            <span className="project-panel-block__title">Description</span>
            <span
              className="project-panel-block__chevron project-panel-block__chevron--collapsed"
              aria-hidden="true"
            >
              ▾
            </span>
          </div>
        </section>

        <section className="project-panel-block project-panel-block--pinned">
          <div className="project-panel-block__header project-panel-block__header--static">
            <span className="project-panel-block__title">Properties</span>
            <span
              className="project-panel-block__chevron project-panel-block__chevron--collapsed"
              aria-hidden="true"
            >
              ▾
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
