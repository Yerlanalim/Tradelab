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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!cooldownUntil) return;
    const interval = window.setInterval(() => {
      const leftMs = Math.max(0, cooldownUntil - Date.now());
      setCooldownLeft(Math.ceil(leftMs / 1000));
      if (leftMs <= 0) {
        window.clearInterval(interval);
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (cooldownLeft > 0) {
      setMessage(`Подождите ${cooldownLeft} сек перед повторной попыткой.`);
      return;
    }
    setIsSubmitting(true);
    const result = await signInWithEmail(email, password);
    setIsSubmitting(false);
    setCooldownUntil(Date.now() + 4000);
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
            <div className="relative">
              <input
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 pr-20 text-sm text-white/80 placeholder:text-white/40"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/60 hover:text-white"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? "Скрыть" : "Показать"}
              </button>
            </div>
          </label>
          <Button className="w-full" type="submit" disabled={isSubmitting || cooldownLeft > 0}>
            {isSubmitting ? "Входим..." : "Войти"}
          </Button>
          {message && (
            <div className="text-xs text-white/60">{message}</div>
          )}
          <div className="text-[11px] text-white/50">
            Если не удается войти, попробуйте восстановить пароль.
          </div>
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
