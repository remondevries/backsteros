export function getAdminEnvironment() {
  return {
    apiUrl: (import.meta.env.VITE_API_URL || "http://127.0.0.1:8787").replace(
      /\/+$/,
      "",
    ),
    clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "",
  };
}
