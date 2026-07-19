import { useEffect, useState } from "react";

/** True after the first client mount (avoids SSR/hydration flicker for portals). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
