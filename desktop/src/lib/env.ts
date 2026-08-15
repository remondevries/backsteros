function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim().replace(/\/$/, "");
}

/** Default local core origin (v2 — never production). */
export const LOCAL_CORE_API_URL = "http://127.0.0.1:8788";

export type DesktopPublicEnvironment = {
  apiUrl: string;
  appUrl: string;
  clerkPublishableKey: string | null;
};

/** Soft read for the scaffold shell — Clerk is optional until auth is wired. */
export function getDesktopPublicEnvironment(): DesktopPublicEnvironment {
  const apiUrl = (import.meta.env.VITE_API_URL ?? LOCAL_CORE_API_URL)
    .trim()
    .replace(/\/$/, "");
  const appUrl = (import.meta.env.VITE_APP_URL ?? "https://backsteros.com/app")
    .trim()
    .replace(/\/$/, "");
  const clerkPublishableKey =
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || null;

  return { apiUrl, appUrl, clerkPublishableKey };
}

export function requireDesktopPublicEnvironment(): DesktopPublicEnvironment {
  return {
    apiUrl: required("VITE_API_URL", import.meta.env.VITE_API_URL),
    appUrl: required("VITE_APP_URL", import.meta.env.VITE_APP_URL),
    clerkPublishableKey: required(
      "VITE_CLERK_PUBLISHABLE_KEY",
      import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
    ),
  };
}
