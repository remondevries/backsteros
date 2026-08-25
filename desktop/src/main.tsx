import React, { useCallback, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AppErrorBoundary } from "./components/app-error-boundary";
import { isDesktopOverlayPath } from "./lib/desktop-overlay";
import { DesktopProviders } from "./lib/desktop-providers";
import "@backsteros/ui/styles.css";
import "./app.css";

const enablePowerSync = !isDesktopOverlayPath(window.location.pathname);

function Root() {
  const [treeKey, setTreeKey] = useState(0);
  const remount = useCallback(() => {
    setTreeKey((key) => key + 1);
  }, []);

  return (
    <AppErrorBoundary onReset={remount}>
      <BrowserRouter>
        <DesktopProviders key={treeKey} enablePowerSync={enablePowerSync}>
          <App />
        </DesktopProviders>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

