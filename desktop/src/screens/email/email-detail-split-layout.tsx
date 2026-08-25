import type { ReactNode, RefObject } from "react";

export type EmailDetailSplitLayoutProps = {
  scrollShellRef?: RefObject<HTMLDivElement | null>;
  scrollportRef?: RefObject<HTMLDivElement | null>;
  minimap?: ReactNode;
  main: ReactNode;
  propertiesRail: ReactNode;
  composerDock: ReactNode;
  propertiesRailWidth: number;
};

export function EmailDetailSplitLayout({
  scrollShellRef,
  scrollportRef,
  minimap,
  main,
  propertiesRail,
  composerDock,
  propertiesRailWidth,
}: EmailDetailSplitLayoutProps) {
  return (
    <div
      className="email-detail-split"
      data-content-detail
      data-detail-split=""
    >
      <div className="email-detail-scroll-shell" ref={scrollShellRef}>
        {minimap}
        <div
          ref={scrollportRef}
          className="email-detail-scrollport email-detail-scrollport--fade"
        >
          <div className="email-detail-scroll-row">
            <div className="email-detail-main">{main}</div>
            {propertiesRail}
          </div>
        </div>
        <div className="email-thread-composer-dock">
          <div className="email-thread-composer-dock__main">
            <div className="email-thread-composer-dock__inner">{composerDock}</div>
          </div>
          <div
            className="email-thread-composer-dock__rail-spacer"
            style={{
              width: propertiesRailWidth,
              flex: `0 0 ${propertiesRailWidth}px`,
            }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
