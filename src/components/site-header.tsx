"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-card/90 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-3 font-semibold tracking-tight"
        >
          <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105">
            <Film className="h-5 w-5" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" />
          </span>
          <div className="leading-tight">
            <span className="font-heading text-lg font-bold text-foreground">
              Gridiron Film
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
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
