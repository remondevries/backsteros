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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
