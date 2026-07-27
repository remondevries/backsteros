import type { HTMLAttributes } from "react";

type LoadingListProps = {
  rows?: number;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

/** Single shared skeleton for content panes — prefer one of these, not stacked full-page loaders. */
export function LoadingList({
  rows = 5,
  className,
  ...rest
}: LoadingListProps) {
  return (
    <div
      className={["loading-list", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} />
      ))}
    </div>
  );
}
