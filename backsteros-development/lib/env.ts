export type PublicEnvironment = {
  clerkPublishableKey: string;
  apiUrl: string;
};

function url(name: string, value: string | undefined, fallback: string) {
  const candidate = (value || fallback).trim();
  try {
    return new URL(candidate).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

/** Soft env for the console — missing Clerk shows configure-auth, does not crash. */
export function getPublicEnvironment(): PublicEnvironment {
  return {
    clerkPublishableKey: (
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""
    ).trim(),
    apiUrl: url(
      "NEXT_PUBLIC_API_URL",
      process.env.NEXT_PUBLIC_API_URL,
      "http://127.0.0.1:8787",
    ),
  };
}
