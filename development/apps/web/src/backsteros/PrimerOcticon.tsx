import { useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
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

type GlyphData = { width: number; path: string };

let octiconsCache: Promise<Record<string, OcticonEntry>> | null = null;
let octiconsData: Record<string, OcticonEntry> | null = null;
let octiconsReady = false;
const octiconsReadyListeners = new Set<() => void>();
const glyphCache = new Map<string, GlyphData | null>();

function emitOcticonsReady() {
  for (const listener of octiconsReadyListeners) listener();
}

function loadOcticons(): Promise<Record<string, OcticonEntry>> {
  octiconsCache ??= fetch(octiconsDataUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load octicons (${response.status})`);
      }
      return response.json() as Promise<Record<string, OcticonEntry>>;
    })
    .then((data) => {
      octiconsData = data;
      octiconsReady = true;
      emitOcticonsReady();
      return data;
    })
    .catch((error) => {
      octiconsCache = null;
      octiconsReady = true;
      emitOcticonsReady();
      throw error;
    });
  return octiconsCache;
}

function resolveGlyph(name: string): GlyphData | null {
  if (glyphCache.has(name)) return glyphCache.get(name) ?? null;
  const icon = octiconsData?.[name];
  const heightData = icon?.heights?.["16"] ?? icon?.heights?.["24"] ?? null;
  glyphCache.set(name, heightData);
  return heightData;
}

function subscribeOcticonsReady(listener: () => void): () => void {
  octiconsReadyListeners.add(listener);
  return () => {
    octiconsReadyListeners.delete(listener);
  };
}

function getOcticonsReady(): boolean {
  return octiconsReady;
}

/**
 * Render a Primer octicon by key. Data is fetched once as JSON (not bundled).
 * Glyph resolution is cached so N icons do not each double-setState after load.
 */
export function PrimerOcticon({
  name,
  size = 16,
  className,
  style,
  title,
  fallback = null,
}: PrimerOcticonProps) {
  const ready = useSyncExternalStore(subscribeOcticonsReady, getOcticonsReady, () => false);

  useEffect(() => {
    void loadOcticons().catch(() => {});
  }, []);

  if (!ready) {
    return <>{fallback}</>;
  }

  const heightData = resolveGlyph(name);
  if (!heightData?.path) {
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
