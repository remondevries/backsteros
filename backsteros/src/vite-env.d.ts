/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_OWNER_API_KEY?: string;
  /** When `1`/`true`, keep cleartext Tailscale `:8788` as local-core (dev-server). */
  readonly VITE_TREAT_API_AS_LOCAL_CORE?: string;
  /**
   * When `1`/`true`/`yes`, shell agent DM chat uses local-core (OS-167 Ralph
   * SIMULATION / payment-proposal preview). Production desktop must leave this
   * unset — loopback `VITE_API_URL` alone still uses the cloud agents door (OS-192).
   */
  readonly VITE_SHELL_CHAT_USE_LOCAL_CORE?: string;
  /** HTTPS gateway hostname for this box (e.g. `dev-os.lemo-design.com`). */
  readonly VITE_DEV_SERVER_HOST?: string;
  readonly VITE_BACKSTEROS_VAULT_PATH?: string;
  readonly VITE_LOCAL_SHELL_TOKEN?: string;
  /** Brandfetch Logo API client ID (public). Enables org logos from website. */
  readonly VITE_BRANDFETCH_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
