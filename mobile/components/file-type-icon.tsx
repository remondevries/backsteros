import { memo, useMemo } from "react";
import { SvgXml } from "react-native-svg";

import {
  buildPierreIconSvgXml,
  colorForPierreToken,
  resolvePierreIconForEntry,
} from "../lib/pierre-icons";
import { FileIcon } from "./file-icon";
import { FolderIcon } from "./folder-icon";

export type FileTypeIconProps = {
  pathValue: string;
  kind?: "file" | "directory";
  size?: number;
};

/**
 * Language/file-type icon — same Pierre sprite + T3 overrides as desktop
 * `FileTypeIcon` (`@backsteros/ui`).
 */
export const FileTypeIcon = memo(function FileTypeIcon({
  pathValue,
  kind = "file",
  size = 14,
}: FileTypeIconProps) {
  const resolved = useMemo(
    () => resolvePierreIconForEntry(pathValue, kind),
    [kind, pathValue],
  );

  if (kind === "directory") {
    return <FolderIcon size={size} color={colorForPierreToken("default")} />;
  }

  if (!resolved) {
    return <FileIcon size={size} color={colorForPierreToken("default")} />;
  }

  const color = colorForPierreToken(resolved.token);
  const xml = buildPierreIconSvgXml(resolved.name, color, size);
  if (!xml) {
    return <FileIcon size={size} color={color} />;
  }

  return <SvgXml xml={xml} width={size} height={size} />;
});
