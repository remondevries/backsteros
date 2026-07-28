import { FileTypeIcon, type FileTypeIconProps } from "@backsteros/ui";
import { memo } from "react";

export type DesktopAgentFileIconProps = FileTypeIconProps;

/**
 * File-type icon for agent chat (shared Pierre FileTypeIcon).
 */
export const DesktopAgentFileIcon = memo(function DesktopAgentFileIcon({
  className,
  ...props
}: DesktopAgentFileIconProps) {
  const classNames = ["desktop-agent-chat__file-type-icon", className]
    .filter(Boolean)
    .join(" ");
  return <FileTypeIcon {...props} className={classNames} />;
});
