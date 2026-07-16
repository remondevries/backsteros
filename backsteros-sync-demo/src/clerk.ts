import { Clerk } from "@clerk/clerk-js";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";

let clerk: Clerk | null = null;

export function clerkEnabled(): boolean {
  return Boolean(publishableKey);
}

export async function initClerk(): Promise<Clerk> {
  if (!publishableKey) {
    throw new Error("Set VITE_CLERK_PUBLISHABLE_KEY for production sign-in");
  }

  if (!clerk) {
    clerk = new Clerk(publishableKey);
    await clerk.load();
  }

  return clerk;
}

export async function getClerkSessionToken(): Promise<string | null> {
  const client = await initClerk();
  return client.session?.getToken() ?? null;
}

export function mountSignIn(element: HTMLDivElement) {
  void initClerk().then((client) => {
    client.mountSignIn(element);
  });
}

export function onClerkAuthChange(callback: (signedIn: boolean) => void) {
  void initClerk().then((client) => {
    const notify = () => callback(Boolean(client.user));
    client.addListener(() => notify());
    notify();
  });
}
