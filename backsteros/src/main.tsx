import "./lib/tauri-invoke-instrumentation";

import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { AppErrorBoundary } from "./components/app-error-boundary";
import { getDesktopPublicEnvironment, isLocalDevApiUrl } from "./lib/env";
import { isTauriRuntime } from "./lib/tauri-runtime";
import { router } from "./router/router";
import "@backsteros/ui/styles.css";
import "./app.css";

/** Native window title so DEBUG is not confused with installed prod. */
function useDevWindowTitle() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const api = getDesktopPublicEnvironment().apiUrl;
    let port = "?";
    try {
      port = new URL(api).port || (isLocalDevApiUrl(api) ? "80" : "?");
    } catch {
      /* keep ? */
    }
    const title = isLocalDevApiUrl(api)
      ? `BacksterOS DEV (:${port})`
      : `BacksterOS DEV`;
    document.title = title;
    if (!isTauriRuntime()) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (cancelled) return;
        await getCurrentWindow().setTitle(title);
      } catch {
        /* document.title already set */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

function Root() {
  const [treeKey, setTreeKey] = useState(0);
  const remount = useCallback(() => {
    setTreeKey((key) => key + 1);
  }, []);
  useDevWindowTitle();

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
