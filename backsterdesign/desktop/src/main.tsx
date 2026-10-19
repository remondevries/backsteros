import { isTauri } from "@tauri-apps/api/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./app.css";

if (isTauri()) {
  document.documentElement.classList.add("tauri-shell");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
