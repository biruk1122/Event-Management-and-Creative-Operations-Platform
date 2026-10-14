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

const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem("lela:theme");
    var dark = t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The theme-init script below adds "dark" before hydration when that
      // preference is stored/system-detected; this class diff is expected
      // and does not affect any other rendered content.
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved/system theme before first paint, avoiding a
         * light-mode flash when the stored or system preference is dark. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
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
