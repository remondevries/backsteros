import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import {
  resolveStartupLocation,
  writeLastLocation,
} from "../lib/last-location";
import { navigateToHref } from "../router/navigate-href";

function locationSearchForPersist(searchStr: string): string {
  if (!searchStr) return "";
  return searchStr.startsWith("?") ? searchStr : `?${searchStr}`;
}

/** Remember the current product route for the next cold start. */
export function PersistLastLocation() {
  const location = useLocation();

  useEffect(() => {
    writeLastLocation(
      `${location.pathname}${locationSearchForPersist(location.searchStr)}`);
  }, [location.pathname, location.searchStr]);

  return null;
}

/** `/` → last location, or `/inbox` when none is stored. */
export function StartupRedirect() {
  const navigate = useNavigate();
  const [href] = useState(() => resolveStartupLocation());

  useEffect(() => {
    navigateToHref(navigate, href, { replace: true });
  }, [href, navigate]);

  return null;
}
