"use client";

import { useRef, useState } from "react";

import {
  consumeSearchableDropdownOpenPlacement,
  type SearchableDropdownOpenPlacement,
} from "../../dropdowns/searchable-dropdown-open-placement.js";

/**
 * Shared “placeholder until first open” mount state for deferred dropdowns.
 */
export function useDeferredDropdownMount() {
  const [mounted, setMounted] = useState(false);
  const [openPlacement, setOpenPlacement] =
    useState<SearchableDropdownOpenPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const mount = () => {
    const placement = rootRef.current
      ? consumeSearchableDropdownOpenPlacement(rootRef.current, "anchored")
      : "anchored";
    if (placement === "center") {
      setOpenPlacement("center");
    }
    setMounted(true);
  };

  return { mounted, openPlacement, rootRef, mount };
}
