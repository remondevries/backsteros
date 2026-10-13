import { SkeletonBlock } from "./skeleton-block.js";

const LINE_WIDTHS = [
  "email-thread-skeleton__line",
  "email-thread-skeleton__line",
  "email-thread-skeleton__line email-thread-skeleton__line--medium",
  "email-thread-skeleton__line",
  "email-thread-skeleton__line email-thread-skeleton__line--medium",
  "email-thread-skeleton__line email-thread-skeleton__line--short",
];

/** Email thread / message body placeholder. */
export function EmailThreadSkeleton() {
  return (
    <div className="email-thread-skeleton" aria-hidden="true">
      <div className="email-thread-skeleton__header">
        <SkeletonBlock className="email-thread-skeleton__subject" />
        <SkeletonBlock className="email-thread-skeleton__meta" />
      </div>
      <div className="email-thread-skeleton__body">
        {LINE_WIDTHS.map((className, index) => (
          <SkeletonBlock key={index} className={className} />
        ))}
      </div>
    </div>
  );
}
