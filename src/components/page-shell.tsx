"use client";

import { SiteHeader } from "@/components/site-header";

type PageShellProps = {
  children: React.ReactNode;
  variant?: "default" | "admin";
};

export function PageShell({ children, variant = "default" }: PageShellProps) {
  return (
    <div className="relative min-h-screen">
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(30,64,115,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(248,250,252,0.8)_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(30,64,115,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(30,64,115,0.04) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <SiteHeader variant={variant} />
      <div className="pt-[var(--site-header-offset,4rem)] max-lg:landscape:pt-0">
        {children}
      </div>
    </div>
  );
}
