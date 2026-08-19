import { useMemo } from "react";
import { SvgXml } from "react-native-svg";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const octicons = require("@primer/octicons") as Record<
  string,
  {
    heights?: Record<
      string,
      {
        width: number;
        path: string;
      }
    >;
  }
>;

type Props = {
  name: string;
  size?: number;
  color?: string;
};

/**
 * Render a Primer octicon by key using SVG path data (RN-safe; no web React icons).
 */
export function PrimerOcticon({
  name,
  size = 16,
  color = "#ededed",
}: Props) {
  const xml = useMemo(() => {
    const icon = octicons[name];
    const heightData = icon?.heights?.["16"] ?? icon?.heights?.["24"];
    if (!heightData?.path) return null;
    const view = heightData.width;
    const paths = heightData.path.replace(
      /<path\b/g,
      `<path fill="${color}"`,
    );
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${view} ${view}">${paths}</svg>`;
  }, [color, name, size]);

  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={size} />;
}

export function hasPrimerOcticon(name: string): boolean {
  const icon = octicons[name];
  return Boolean(icon?.heights?.["16"]?.path || icon?.heights?.["24"]?.path);
}
