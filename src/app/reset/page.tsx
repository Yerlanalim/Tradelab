"use client";

import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { requestPasswordReset } from "@/lib/auth/authService";

export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const result = await requestPasswordReset(email);
    setMessage(
      result.ok ? "Ссылка отправлена на email." : result.error ?? "Ошибка."
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
          <Button className="w-full" type="submit">
            Отправить ссылку
          </Button>
          {message && (
            <div className="text-xs text-white/60">{message}</div>
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
