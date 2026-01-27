"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { requestPasswordReset } from "@/lib/auth/authService";

export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);

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
    setIsSuccess(false);
    if (cooldownLeft > 0) {
      setMessage(`Подождите ${cooldownLeft} сек перед повторной попыткой.`);
      return;
    }
    setIsSubmitting(true);
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset/confirm` : undefined;
    const result = await requestPasswordReset(email, redirectTo);
    setIsSubmitting(false);
    setCooldownUntil(Date.now() + 4000);
    setIsSuccess(result.ok);
    setMessage(
      result.ok
        ? "Ссылка отправлена. Проверьте почту и папку «Спам»."
        : result.error ?? "Ошибка."
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-[#0A1628] via-[#1A2B4A] to-[#0F1F3A] px-6">
      <Card title="Сброс пароля" description="Восстановление доступа">
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
          <Button className="w-full" type="submit" disabled={isSubmitting || cooldownLeft > 0}>
            {isSubmitting ? "Отправляем..." : "Отправить ссылку"}
          </Button>
          {message && (
            <div className="text-xs text-white/60">{message}</div>
          )}
          {isSuccess && (
            <div className="text-[11px] text-white/50">
              Если письма нет 2–3 минуты, проверьте «Спам» или отправьте повторно.
            </div>
          )}
          <div className="text-center text-xs">
            <Link className="underline text-white/60" href="/login">
              Вернуться к входу
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
