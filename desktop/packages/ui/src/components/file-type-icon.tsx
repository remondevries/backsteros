"use client";

import { memo, useInsertionEffect, useMemo } from "react";

import { ComposeFolderIcon } from "./compose-folder-icon.js";
import {
  ensurePierreIconSprite,
  resolvePierreIconForEntry,
} from "../pierre-icons.js";

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

function FallbackFileIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2.75 1A1.75 1.75 0 0 0 1 2.75v10.5C1 14.216 1.784 15 2.75 15h10.5A1.75 1.75 0 0 0 15 13.25V6.5a.75.75 0 0 0-.22-.53l-4.75-4.75A.75.75 0 0 0 9.5 1H2.75Zm6.75 1.56L13.44 6.5H10.25A.75.75 0 0 1 9.5 5.75V2.56Z" />
    </svg>
  );
}

export type FileTypeIconProps = {
  pathValue: string;
  kind?: "file" | "directory";
  className?: string;
  size?: number;
};

/**
 * Language/file-type icon (Pierre sprite sheet + T3 exact-name overrides).
 */
export const FileTypeIcon = memo(function FileTypeIcon({
  pathValue,
  kind = "file",
  className,
  size = 14,
}: FileTypeIconProps) {
  useInsertionEffect(ensurePierreIconSprite, []);
  const icon = useMemo(
    () => resolvePierreIconForEntry(pathValue, kind),
    [kind, pathValue],
  );

  const classNames = ["file-type-icon", className].filter(Boolean).join(" ");

  if (!icon) {
    return kind === "directory" ? (
      <ComposeFolderIcon className={classNames || undefined} />
    ) : (
      <span className={classNames || undefined}>
        <FallbackFileIcon size={size} />
      </span>
    );
  }

  const color = ICON_COLORS[icon.token ?? "default"] ?? ICON_COLORS.default;
  return (
    <svg
      aria-hidden="true"
      data-pierre-icon={icon.name}
      data-icon-token={icon.token}
      className={classNames}
      width={size}
      height={size}
      style={{ color }}
      viewBox="0 0 16 16"
    >
      <use href={`#${icon.name}`} />
    </svg>
  );
});
