import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { getPublicEnvironment } from "@/lib/env";

import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: { default: "Backsteros", template: "%s · Backsteros" },
  description: "Projects, tasks, people, and knowledge in one workspace.",
  metadataBase: new URL("https://app.backsteros.com"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const env = getPublicEnvironment();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <Providers publishableKey={env.clerkPublishableKey} apiUrl={env.apiUrl}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
