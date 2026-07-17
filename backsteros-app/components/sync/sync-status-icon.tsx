import { SyncIcon } from "@primer/octicons-react";

type SyncStatusIconProps = {
  className?: string;
  size?: number;
};

export function SyncStatusIdleIcon({
  className,
  size = 16,
}: SyncStatusIconProps) {
  return <SyncIcon aria-hidden className={className} size={size} />;
}
