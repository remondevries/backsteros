import { SkeletonBlock } from "./skeleton-block.js";

/** Contact hub — header tabs + overview fields. */
export function ContactHubSkeleton() {
  return (
    <div className="contact-hub-skeleton" aria-hidden="true">
      <div className="contact-hub-skeleton__header">
        <SkeletonBlock className="contact-hub-skeleton__avatar" />
        <SkeletonBlock className="contact-hub-skeleton__title" />
      </div>
      <div className="contact-hub-skeleton__tabs">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock key={index} className="contact-hub-skeleton__tab" />
        ))}
      </div>
      <div className="contact-hub-skeleton__body">
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonBlock key={index} className="contact-hub-skeleton__row" />
        ))}
      </div>
    </div>
  );
}
