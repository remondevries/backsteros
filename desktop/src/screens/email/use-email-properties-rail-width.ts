import { useEffect, useState, type RefObject } from "react";

export function useEmailPropertiesRailWidth(
  panelRef: RefObject<HTMLElement | null>,
  resetKey?: string | null,
) {
  const [propertiesRailWidth, setPropertiesRailWidth] = useState(300);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const width = Math.round(el.getBoundingClientRect().width);
      if (width > 0) setPropertiesRailWidth(width);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [panelRef, resetKey]);

  return propertiesRailWidth;
}
