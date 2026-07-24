import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getPublicEnvironment } from "@/lib/env";

import "@backsteros/ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "BacksterOS Development",
  description: "Agent console — projects, terminals, and tasks.",
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
