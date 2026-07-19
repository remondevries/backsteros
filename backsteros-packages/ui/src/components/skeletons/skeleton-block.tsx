type SkeletonBlockProps = {
  className?: string;
  as?: "div" | "span";
};

/** Shared pulse block used by detail / list skeletons. */
export function SkeletonBlock({
  className = "",
  as: Tag = "div",
}: SkeletonBlockProps) {
  return (
    <Tag
      className={["detail-skeleton-block", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
