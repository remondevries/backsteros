type PublicEnvironment = {
  clerkPublishableKey: string;
  appUrl: string;
  apiUrl: string;
};

function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function url(name: string, value: string | undefined) {
  const candidate = required(name, value);
  try {
    return new URL(candidate).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

export function getPublicEnvironment(): PublicEnvironment {
  return {
    clerkPublishableKey: required(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    ),
    appUrl: url("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL),
    apiUrl: url("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL),
  };
}

export function validateServerEnvironment() {
  getPublicEnvironment();
  required("CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY);
}
