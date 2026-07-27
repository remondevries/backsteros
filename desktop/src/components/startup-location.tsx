import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import {
  resolveStartupLocation,
  writeLastLocation,
} from "../lib/last-location";

/** Remember the current product route for the next cold start. */
export function PersistLastLocation() {
  const location = useLocation();

  useEffect(() => {
    writeLastLocation(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}

/** `/` → last location, or `/inbox` when none is stored. */
export function StartupRedirect() {
  const [to] = useState(() => resolveStartupLocation());
  return <Navigate to={to} replace />;
}
