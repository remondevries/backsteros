import {
  PIERRE_BUILT_IN_FILE_EXTENSION_TOKENS,
  PIERRE_BUILT_IN_FILE_NAME_TOKENS,
  PIERRE_COMPLETE_EXTENSION_OVERRIDES,
  PIERRE_FILE_ICON_SYMBOLS,
  PIERRE_T3_BY_FILE_NAME,
} from "./generated/pierre-file-icons";

export type PierreIconResolution = {
  name: string;
  token?: string;
};

/** Dark-theme token colors — same as desktop `FileTypeIcon`. */
export const FILE_TYPE_ICON_COLORS: Record<string, string> = {
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

function basenameOfPath(pathValue: string): string {
  const slashIndex = pathValue.lastIndexOf("/");
  return slashIndex === -1 ? pathValue : pathValue.slice(slashIndex + 1);
}

function getExtensionCandidates(fileName: string): string[] {
  const segments = fileName.toLowerCase().split(".");
  const candidates: string[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    candidates.push(segments.slice(index).join("."));
  }
  return candidates;
}

/**
 * Same resolution as desktop Pierre + T3 overrides, without importing
 * `@pierre/trees` at runtime (ESM/preact package is not Metro-friendly).
 */
export function resolvePierreIconForEntry(
  pathValue: string,
  kind: "file" | "directory",
): PierreIconResolution | null {
  if (kind === "directory") return null;

  const fileName = basenameOfPath(pathValue);
  const lowerFileName = fileName.toLowerCase();

  const t3Name = PIERRE_T3_BY_FILE_NAME[lowerFileName];
  if (t3Name != null) return { name: t3Name };

  const fileNameToken = PIERRE_BUILT_IN_FILE_NAME_TOKENS[lowerFileName];
  if (fileNameToken != null) {
    return {
      name: `file-tree-builtin-${fileNameToken}`,
      token: fileNameToken,
    };
  }

  for (const extension of getExtensionCandidates(fileName)) {
    const override = PIERRE_COMPLETE_EXTENSION_OVERRIDES[extension];
    if (override != null) {
      return {
        name: `file-tree-builtin-${override}`,
        token: override,
      };
    }
    const match = PIERRE_BUILT_IN_FILE_EXTENSION_TOKENS[extension];
    if (match != null) {
      return {
        name: `file-tree-builtin-${match}`,
        token: match,
      };
    }
  }

  return {
    name: "file-tree-builtin-default",
    token: "default",
  };
}

/**
 * Build a self-contained SVG string for react-native-svg `SvgXml`.
 * Replaces `currentColor` with the resolved token color.
 */
export function buildPierreIconSvgXml(
  iconName: string,
  color: string,
  size: number,
): string | null {
  const symbol = PIERRE_FILE_ICON_SYMBOLS[iconName];
  if (!symbol) return null;
  const body = symbol.body
    .replace(/current[Cc]olor/g, color)
    .replace(/currentcolor/g, color);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${symbol.viewBox}" fill="none">${body}</svg>`;
}

export function colorForPierreToken(token: string | undefined): string {
  return (
    FILE_TYPE_ICON_COLORS[token ?? "default"] ?? FILE_TYPE_ICON_COLORS.default
  );
}
