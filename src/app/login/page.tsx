"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { signInWithEmail } from "@/lib/auth/authService";
import { useSupabaseAuth } from "@/lib/auth/supabaseAuth";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useSupabaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const result = await signInWithEmail(email, password);
    setMessage(result.ok ? "Вход выполнен." : result.error ?? "Ошибка входа.");
    if (result.ok) {
      router.push("/dashboard");
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  if (!isLoading && isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-[#0A1628] via-[#1A2B4A] to-[#0F1F3A] px-6">
      <Card title="Вход" description="Авторизация через Supabase">
        <form
          className="space-y-4 text-sm text-white/80"
          onSubmit={handleSubmit}
        >
          <label className="flex flex-col gap-2 text-xs">
            Email
            <input
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/80 placeholder:text-white/40"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-xs">
            Пароль
            <input
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/80 placeholder:text-white/40"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <Button className="w-full" type="submit">
            Войти
          </Button>
          {message && (
            <div className="text-xs text-white/60">{message}</div>
          )}
          <div className="flex items-center justify-between text-xs">
            <Link className="underline text-white/60" href="/reset">
              Забыли пароль?
            </Link>
            <Link className="underline text-white/60" href="/register">
              Регистрация
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
