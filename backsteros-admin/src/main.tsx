import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { AdminProviders } from "./lib/providers";
import "./styles.css";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basePath === "/" ? undefined : basePath}>
      <AdminProviders>
        <App />
      </AdminProviders>
    </BrowserRouter>
  </StrictMode>,
);
