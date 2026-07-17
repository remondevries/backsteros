import { getDesktopPublicEnvironment } from "./lib/env";
import "./App.css";

const env = getDesktopPublicEnvironment();

export default function App() {
  return (
    <main className="shell">
      <header className="shell-header">
        <p className="shell-brand">BacksterOS</p>
        <h1>Desktop</h1>
        <p className="shell-lede">
          Tauri 2 + Vite/React scaffold. Product UI will track{" "}
          <code>backsteros-app</code> closely; this shell talks to the remote
          API only (no Next.js sidecar).
        </p>
      </header>

      <dl className="shell-meta">
        <div>
          <dt>API</dt>
          <dd>
            <code>{env.apiUrl}</code>
          </dd>
        </div>
        <div>
          <dt>Web product</dt>
          <dd>
            <code>{env.appUrl}</code>
          </dd>
        </div>
        <div>
          <dt>Clerk</dt>
          <dd>{env.clerkPublishableKey ? "Configured" : "Not set yet"}</dd>
        </div>
      </dl>

      <p className="shell-hint">
        Next: Clerk SPA auth, PowerSync web, then port inbox/tasks from the web
        app. Specs: ADR-019, <code>docs/05-clients.md</code>.
      </p>
    </main>
  );
}
