export function ConfigureAuthScreen() {
  return (
    <div className="console-auth">
      <div className="console-auth-panel">
        <h1>BacksterOS Development</h1>
        <p>
          Sign-in is required. Set{" "}
          <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in{" "}
          <code>backsteros-development/.env</code> (see{" "}
          <code>.env.example</code>), then restart the dev server.
        </p>
        <p>
          Also set <code>NEXT_PUBLIC_API_URL</code> (default{" "}
          <code>http://127.0.0.1:8787</code>) and allow origin{" "}
          <code>http://localhost:3100</code> in Clerk and API CORS.
        </p>
      </div>
    </div>
  );
}
