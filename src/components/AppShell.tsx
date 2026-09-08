import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Radio, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useProfile, useSignOut } from "@/hooks/useAuth";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-gradient shadow-glow">
        <Radio className="size-4 text-primary-foreground" />
      </span>
      {!compact && (
        <span className="text-base font-semibold tracking-tight">
          Ad<span className="text-brand-gradient">Bridge</span>
        </span>
      )}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();
  const signOut = useSignOut();
  const navigate = useNavigate();

  const homeHref =
    profile?.role === "brand"
      ? "/dashboard/brand"
      : profile?.role === "admin"
        ? "/admin"
        : "/dashboard/creator";

  return (
    <div className="min-h-screen bg-background bg-aurora">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to={homeHref} className="flex items-center gap-2">
            <Logo />
          </Link>

          <nav className="flex items-center gap-2">
            {profile?.role === "admin" && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin">
                  <ShieldCheck className="size-4" /> Admin
                </Link>
              </Button>
            )}
            <span className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:flex">
              <Sparkles className="size-3.5 text-primary" />
              {profile?.full_name || profile?.email || "Account"}
              <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary capitalize">
                {profile?.role ?? "…"}
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth/login", replace: true });
              }}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
