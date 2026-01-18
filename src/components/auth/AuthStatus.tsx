"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { useSupabaseAuth } from "@/lib/auth/supabaseAuth";

export function AuthStatus() {
  const { isAuthenticated, user, signOut } = useSupabaseAuth();

  return (
    <div className="flex items-center gap-3 text-xs text-[var(--tl-text-inverse-weak)]">
      <span>{isAuthenticated ? user?.email : "Гость"}</span>
      {isAuthenticated ? (
        <Button
          variant="ghost"
          className="text-[var(--tl-text-inverse-weak)] hover:bg-[var(--tl-bg-2)]"
          onClick={signOut}
        >
          Выйти
        </Button>
      ) : (
        <Link className="text-[var(--tl-accent-strong)] underline" href="/login">
          Войти
        </Link>
      )}
    </div>
  );
}
