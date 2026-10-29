import type { ReactNode } from "react";
import {
  CalendarDays,
  CheckSquare2,
  ChartNoAxesCombined,
  Users,
} from "lucide-react";

import { BrandLogo } from "@/components/branding/brand-logo";

import styles from "./auth-shell.module.css";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Server-rendered branding surrounds the existing interactive login form.
 * The decorative photo is `public/branding/login-page.webp`, a resized/
 * compressed encoding of the provided `login page.png` asset (see
 * `scripts/optimize-lela-branding-assets.mjs`).
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className={styles.shell}>
      <link
        rel="preload"
        as="image"
        href="/branding/lela-login-logo.webp"
        fetchPriority="high"
      />
      <header className={styles.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element -- matches
            BrandLogo's own raw-<img>/<image> convention in this feature. */}
        <img
          src="/branding/lela%20mark.jpg"
          alt="Lela Creative Management"
          width={1078}
          height={992}
          className={styles.brandIcon ?? ""}
        />
        <p className="text-muted-foreground text-sm">
          Event &amp; creative operations
        </p>
      </header>
      <section className={styles.hero} aria-labelledby="login-hero-title">
        <p className="text-muted-foreground mb-5 text-xs font-semibold tracking-[0.2em] uppercase">
          Ideas. People. Possibilities.
        </p>
        <h2 id="login-hero-title" className={styles.headline}>
          Turn your ideas into <span>unforgettable events.</span>
        </h2>
        <p className="text-muted-foreground mt-6 max-w-md text-lg leading-8">
          Bring your events, creative projects and team together — all in one
          place.
        </p>
        <ul className={styles.capabilities} aria-label="Connected work areas">
          {[
            { label: "Events", icon: CalendarDays },
            { label: "Tasks", icon: CheckSquare2 },
            { label: "Team", icon: Users },
            { label: "Reports", icon: ChartNoAxesCombined },
          ].map(({ label, icon: Icon }) => (
            <li
              key={label}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <span className="bg-accent text-accent-foreground rounded-xl p-2.5">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              {label}
            </li>
          ))}
        </ul>
        <div className={styles.stage} aria-hidden="true">
          <div className={styles.stageOverlay} />
          <p>
            It&apos;s not new,
            <br />
            it&apos;s beyond.
          </p>
        </div>
      </section>
      <section className={styles.formRegion} aria-labelledby="login-title">
        <div className={styles.card}>
          <BrandLogo optimized compact decorative className="mb-6 w-8" />
          <h1
            id="login-title"
            className="text-3xl font-semibold tracking-tight text-balance"
          >
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              {description}
            </p>
          ) : null}
          <div className="mt-8">{children}</div>
          <p className="text-muted-foreground mt-7 border-t pt-5 text-sm leading-6">
            Need access? Contact your company administrator.
          </p>
          {footer ? (
            <div className="text-muted-foreground mt-4 text-sm leading-6">
              {footer}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
