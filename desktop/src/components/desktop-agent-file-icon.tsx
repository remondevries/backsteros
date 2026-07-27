import { FileIcon, FolderIcon } from "lucide-react";
import { memo, useInsertionEffect, useMemo } from "react";

import {
  ensurePierreIconSprite,
  resolvePierreIconForEntry,
} from "../lib/agent/pierre-icons";

/** Dark-theme token colors from T3 `PierreEntryIcon`. */
const ICON_COLORS: Record<string, string> = {
  astro: "#d568ea",
  babel: "#ffd452",
  bash: "#5ecc71",
  biome: "#69b1ff",
  bootstrap: "#9d6afb",
  browserslist: "#ffd452",
  bun: "#79697b",
  c: "#69b1ff",
  claude: "#ffa359",
  cpp: "#69b1ff",
  css: "#9d6afb",
  database: "#d568ea",
  default: "#adadb1",
  docker: "#69b1ff",
  eslint: "#9d6afb",
  git: "#d5512f",
  go: "#68cdf2",
  graphql: "#ff678d",
  html: "#ffa359",
  image: "#ff678d",
  javascript: "#ffd452",
  json: "#ffa359",
  markdown: "#5ecc71",
  mcp: "#64d1db",
  nextjs: "#adadb1",
  npm: "#ff6762",
  oxc: "#68cdf2",
  postcss: "#ff6762",
  prettier: "#64d1db",
  python: "#69b1ff",
  react: "#68cdf2",
  ruby: "#ff6762",
  rust: "#ffa359",
  sass: "#ff678d",
  stylelint: "#adadb1",
  svelte: "#ff6762",
  svg: "#ffa359",
  svgo: "#5ecc71",
  swift: "#ffa359",
  table: "#64d1db",
  tailwind: "#68cdf2",
  terraform: "#9d6afb",
  text: "#adadb1",
  typescript: "#69b1ff",
  vite: "#d568ea",
  vscode: "#69b1ff",
  vue: "#5ecc71",
  wasm: "#9d6afb",
  webpack: "#69b1ff",
  yml: "#ff6762",
  zig: "#ffa359",
  zip: "#ffa359",
};

export type DesktopAgentFileIconProps = {
  pathValue: string;
  kind?: "file" | "directory";
  className?: string;
};

/**
 * File-type icon for agent chat (T3 Pierre sprite icons).
 * Desktop chat is dark-only, so token colors use the dark palette.
 */
export const DesktopAgentFileIcon = memo(function DesktopAgentFileIcon({
  pathValue,
  kind = "file",
  className,
}: DesktopAgentFileIconProps) {
  useInsertionEffect(ensurePierreIconSprite, []);
  const icon = useMemo(
    () => resolvePierreIconForEntry(pathValue, kind),
    [kind, pathValue],
  );

  const classNames = ["desktop-agent-chat__file-type-icon", className]
    .filter(Boolean)
    .join(" ");

  if (!icon) {
    return kind === "directory" ? (
      <FolderIcon
        className={classNames}
        aria-hidden
        size={14}
        strokeWidth={1.8}
      />
    ) : (
      <FileIcon
        className={classNames}
        aria-hidden
        size={14}
        strokeWidth={1.8}
      />
    );
  }

  const color = ICON_COLORS[icon.token ?? "default"] ?? ICON_COLORS.default;
  return (
    <svg
      aria-hidden="true"
      data-pierre-icon={icon.name}
      data-icon-token={icon.token}
      className={classNames}
      style={{ color }}
      viewBox="0 0 16 16"
    >
      <use href={`#${icon.name}`} />
    </svg>
  );
});
