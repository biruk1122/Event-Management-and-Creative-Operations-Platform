import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";
import { ApplicationShell } from "@/components/shell/application-shell";
import { Suspense } from "react";

import "./globals.css";
import "@/components/shell/shell.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Nexo Operations",
    template: "%s | Nexo Operations",
  },
  description:
    "The unified event management and creative operations workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AppProviders>
          <Suspense fallback={children}>
            <ApplicationShell>{children}</ApplicationShell>
          </Suspense>
        </AppProviders>
      </body>
    </html>
  );
}
