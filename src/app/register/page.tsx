"use client";

import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { signUpWithEmail } from "@/lib/auth/authService";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const result = await signUpWithEmail(email, password);
    setMessage(
      result.ok ? "Регистрация выполнена." : result.error ?? "Ошибка регистрации."
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-[#0A1628] via-[#1A2B4A] to-[#0F1F3A] px-6">
      <Card title="Регистрация" description="Создание аккаунта">
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
            Создать аккаунт
          </Button>
          {message && (
            <div className="text-xs text-white/60">{message}</div>
          )}
          <div className="text-center text-xs">
            Уже есть аккаунт?{" "}
            <Link className="underline text-white/60" href="/login">
              Войти
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
