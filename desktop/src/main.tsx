import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { isDesktopOverlayPath } from "./lib/desktop-overlay";
import { DesktopProviders } from "./lib/desktop-providers";
import "@backsteros/ui/styles.css";
import "./app.css";

const enablePowerSync = !isDesktopOverlayPath(window.location.pathname);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <DesktopProviders enablePowerSync={enablePowerSync}>
        <App />
      </DesktopProviders>
    </BrowserRouter>
  </React.StrictMode>,
);
