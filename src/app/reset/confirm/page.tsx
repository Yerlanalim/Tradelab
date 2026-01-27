"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { supabaseClient } from "@/lib/supabase/client";
import { getPasswordIssues, isPasswordValid } from "@/lib/auth/passwordPolicy";

export default function ResetConfirmPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const passwordIssues = useMemo(() => getPasswordIssues(password), [password]);
  const passwordMismatch =
    confirmPassword.length > 0 && password.trim() !== confirmPassword.trim();

  useEffect(() => {
    let isMounted = true;
    const loadSession = async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (!isMounted) return;
      setHasSession(Boolean(data.session));
    };
    loadSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setIsSuccess(false);
    if (!isPasswordValid(password)) {
      setMessage("Пароль не соответствует требованиям.");
      return;
    }
    if (passwordMismatch) {
      setMessage("Пароли не совпадают.");
      return;
    }
    setIsSubmitting(true);
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) {
      setIsSubmitting(false);
      setMessage(error.message);
      return;
    }
    await supabaseClient.auth.signOut();
    setIsSubmitting(false);
    setIsSuccess(true);
    setMessage("Пароль обновлен. Войдите с новым паролем.");
  };

  if (hasSession === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-[#0A1628] via-[#1A2B4A] to-[#0F1F3A] px-6">
        <Card title="Смена пароля" description="Ссылка недействительна">
          <div className="space-y-3 text-sm text-white/70">
            <p>Откройте ссылку из письма или запросите новый сброс.</p>
            <Link className="underline text-emerald-200" href="/reset">
              Запросить новую ссылку
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (hasSession === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-[#0A1628] via-[#1A2B4A] to-[#0F1F3A] px-6">
        <Card title="Смена пароля" description="Проверка ссылки">
          <div className="text-sm text-white/70">Загрузка...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-[#0A1628] via-[#1A2B4A] to-[#0F1F3A] px-6">
      <Card title="Смена пароля" description="Введите новый пароль">
        <form className="space-y-4 text-sm text-white/80" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-xs">
            Новый пароль
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
            <div className="text-[11px] text-white/50">
              Требования: минимум 8 символов, буквы и цифры.
            </div>
            {password.length > 0 && passwordIssues.length > 0 && (
              <div className="text-[11px] text-amber-200">
                {passwordIssues.join(". ")}.
              </div>
            )}
          </label>
          <label className="flex flex-col gap-2 text-xs">
            Повторите пароль
            <div className="relative">
              <input
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 pr-20 text-sm text-white/80 placeholder:text-white/40"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/60 hover:text-white"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
              >
                {showConfirmPassword ? "Скрыть" : "Показать"}
              </button>
            </div>
            {passwordMismatch && (
              <div className="text-[11px] text-amber-200">Пароли не совпадают.</div>
            )}
          </label>
          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Сохраняем..." : "Обновить пароль"}
          </Button>
          {message && <div className="text-xs text-white/60">{message}</div>}
          {isSuccess && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              <div>Пароль обновлен. Войдите с новым паролем.</div>
              <Link className="mt-2 inline-block underline text-emerald-200" href="/login">
                Перейти ко входу
              </Link>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
