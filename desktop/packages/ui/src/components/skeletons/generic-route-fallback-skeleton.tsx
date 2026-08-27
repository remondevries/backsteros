import { SkeletonBlock } from "./skeleton-block.js";

/** Generic opaque fallback when no dedicated skeleton exists. */
export function GenericRouteFallbackSkeleton() {
  return (
    <div className="generic-route-fallback-skeleton" aria-hidden="true">
      <SkeletonBlock className="generic-route-fallback-skeleton__title" />
      <div className="generic-route-fallback-skeleton__lines">
        <SkeletonBlock className="generic-route-fallback-skeleton__line generic-route-fallback-skeleton__line--wide" />
        <SkeletonBlock className="generic-route-fallback-skeleton__line" />
        <SkeletonBlock className="generic-route-fallback-skeleton__line generic-route-fallback-skeleton__line--medium" />
      </div>
    </div>
  );
}
