import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
// Vite `?url` keeps this as a static asset (~1MB JSON) instead of inlining a
// ~6.6MB JS module into the graph (which breaks Electron t3code-dev loads).
import octiconsDataUrl from "@primer/octicons/build/data.json?url";

type PrimerOcticonProps = {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
  /** Shown while JSON loads or when the key is missing. */
  fallback?: ReactNode;
};

type OcticonEntry = {
  heights?: Record<
    string,
    {
      width: number;
      path: string;
    }
  >;
};

let octiconsCache: Promise<Record<string, OcticonEntry>> | null = null;

function loadOcticons(): Promise<Record<string, OcticonEntry>> {
  octiconsCache ??= fetch(octiconsDataUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load octicons (${response.status})`);
      }
      return response.json() as Promise<Record<string, OcticonEntry>>;
    })
    .catch((error) => {
      octiconsCache = null;
      throw error;
    });
  return octiconsCache;
}

/**
 * Render a Primer octicon by key. Data is fetched once as JSON (not bundled).
 */
export function PrimerOcticon({
  name,
  size = 16,
  className,
  style,
  title,
  fallback = null,
}: PrimerOcticonProps) {
  const [heightData, setHeightData] = useState<{
    width: number;
    path: string;
  } | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolved(false);
    void loadOcticons()
      .then((data) => {
        if (cancelled) return;
        const icon = data[name];
        setHeightData(icon?.heights?.["16"] ?? icon?.heights?.["24"] ?? null);
        setResolved(true);
      })
      .catch(() => {
        if (!cancelled) {
          setHeightData(null);
          setResolved(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (!resolved || !heightData?.path) {
    return <>{fallback}</>;
  }

  const view = heightData.width;
  const paths = heightData.path.replace(/<path\b/g, '<path fill="currentColor"');

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${view} ${view}`}
      {...(title != null ? { "aria-label": title } : { "aria-hidden": true as const })}
      {...(className != null ? { className } : {})}
      {...(style != null ? { style } : {})}
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}

export function hasPrimerOcticonCandidate(name: string): boolean {
  // Until JSON loads we optimistically treat unknown keys as primer candidates;
  // ProjectOcticon falls back if the glyph is missing after fetch.
  return name.length > 2 && !/\s/.test(name);
}
