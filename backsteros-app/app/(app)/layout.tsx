import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { isE2eAuthBypassEnabled } from "@/lib/e2e-bypass-auth";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!isE2eAuthBypassEnabled()) {
    try {
      const { userId } = await auth();
      if (!userId) redirect("/sign-in");
    } catch {
      // Missing static assets (e.g. favicon) can hit this layout without
      // clerkMiddleware; avoid crashing the authenticated shell.
      redirect("/sign-in");
    }
  }

  return <AppShell>{children}</AppShell>;
}
