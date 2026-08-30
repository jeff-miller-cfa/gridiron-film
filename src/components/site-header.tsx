"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { AdminLogoutButton } from "@/components/admin-logout-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Film, Shield } from "lucide-react";

type SiteHeaderProps = {
  variant?: "default" | "admin";
};

export function SiteHeader({ variant = "default" }: SiteHeaderProps) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const root = document.documentElement;
    const landscapeMobile = window.matchMedia(
      "(max-width: 1023px) and (orientation: landscape)",
    );

    // Track the true visible viewport height. iOS Safari mis-measures `svh`
    // for `position: fixed` elements (it uses the large viewport), so the
    // locked landscape player relies on this measured value instead.
    const syncViewportHeight = () => {
      const height = Math.round(
        window.visualViewport?.height ?? window.innerHeight,
      );
      root.style.setProperty("--visual-vh", `${height}px`);
    };

    const syncHeaderOffset = () => {
      if (landscapeMobile.matches) {
        // Clear the portrait-measured overrides so the landscape CSS
        // media-query values (offset 0, height 2.75rem) take over. Leaving
        // them inline would keep the taller portrait header height stuck
        // after an orientation change and mis-size the player stage.
        root.style.removeProperty("--site-header-offset");
        root.style.removeProperty("--site-header-height");
        return;
      }

      const height = Math.ceil(header.getBoundingClientRect().height);
      root.style.setProperty("--site-header-offset", `${height}px`);
      root.style.setProperty("--site-header-height", `${height}px`);
    };

    const sync = () => {
      syncHeaderOffset();
      syncViewportHeight();
    };

    sync();

    const observer = new ResizeObserver(sync);
    observer.observe(header);
    landscapeMobile.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.visualViewport?.addEventListener("resize", syncViewportHeight);
    window.visualViewport?.addEventListener("scroll", syncViewportHeight);

    return () => {
      observer.disconnect();
      landscapeMobile.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.visualViewport?.removeEventListener("resize", syncViewportHeight);
      window.visualViewport?.removeEventListener("scroll", syncViewportHeight);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      data-site-header
      className="fixed inset-x-0 top-0 z-50 box-border h-16 border-b border-border/60 bg-card/90 backdrop-blur-md max-lg:landscape:static max-lg:landscape:h-11 max-lg:landscape:shadow-none"
    >
      <div className="flex h-full w-full items-center justify-between px-4 max-lg:landscape:px-3 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-3 font-semibold tracking-tight"
        >
          <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105 max-lg:landscape:h-8 max-lg:landscape:w-8">
            <Film className="h-5 w-5 max-lg:landscape:h-4 max-lg:landscape:w-4" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" />
          </span>
          <div className="leading-tight">
            <span className="font-heading text-lg font-bold text-foreground">
              Gridiron Film
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground max-lg:landscape:hidden">
              Game footage
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          {!isAdmin && (
            <Link
              href="/admin/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5 border-primary/20 text-primary hover:bg-primary/5",
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              Admin
            </Link>
          )}
          {variant === "admin" && isAdmin && pathname !== "/admin/login" && (
            <>
              <Link
                href="/"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "text-muted-foreground",
                )}
              >
                View site
              </Link>
              <AdminLogoutButton size="sm" />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
