/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_OWNER_API_KEY?: string;
  readonly VITE_BACKSTEROS_VAULT_PATH?: string;
  readonly VITE_LOCAL_SHELL_TOKEN?: string;
  /** Brandfetch Logo API client ID (public). Enables org logos from website. */
  readonly VITE_BRANDFETCH_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
