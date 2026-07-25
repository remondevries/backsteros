import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getPublicEnvironment } from "@/lib/env";

import "@backsteros/ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "BacksterOS ops admin — health, sync, and observability.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const env = getPublicEnvironment();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers
          publishableKey={env.clerkPublishableKey}
          apiUrl={env.apiUrl}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
