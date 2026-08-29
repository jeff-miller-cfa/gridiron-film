"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AdminLogoutButtonProps = {
  size?: "default" | "sm";
  className?: string;
};

export function AdminLogoutButton({
  size = "default",
  className,
}: AdminLogoutButtonProps) {
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <Button
      variant="outline"
      size={size}
      className={cn("rounded-xl", className)}
      onClick={() => void logout()}
    >
      Log out
    </Button>
  );
}
