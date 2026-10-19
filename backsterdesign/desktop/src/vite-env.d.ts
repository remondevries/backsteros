/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PENPOT_PUBLIC_URI?: string;
  readonly PENPOT_PUBLIC_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
