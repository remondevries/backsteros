import "./lib/tauri-invoke-instrumentation";

import React, { useCallback, useState } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { AppErrorBoundary } from "./components/app-error-boundary";
import { router } from "./router/router";
import "@backsteros/ui/styles.css";
import "./app.css";

function Root() {
  const [treeKey, setTreeKey] = useState(0);
  const remount = useCallback(() => {
    setTreeKey((key) => key + 1);
  }, []);

  return (
    <AppErrorBoundary onReset={remount}>
      <RouterProvider router={router} key={treeKey} />
    </AppErrorBoundary>
  );
}

// TEMP perf experiment: StrictMode double-invokes effects in dev, which
// dominated the navigation trace. Disabled to measure the real (prod-like)
// cost. Restore <React.StrictMode> once done.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <Root />,
);
void React;
