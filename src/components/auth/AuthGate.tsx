"use client";

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { useSupabaseAuth } from "@/lib/auth/supabaseAuth";

type AuthGateProps = {
  children: React.ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useSupabaseAuth();

  if (isLoading) {
    return (
      <Card title="Проверяем доступ" description="Подключение к Supabase">
        <div className="text-sm text-white/60">Загрузка...</div>
      </Card>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card
        title="Требуется авторизация"
        description="Этот раздел доступен только после входа."
      >
        <div className="space-y-3 text-sm text-white/70">
          <p>Пожалуйста, войдите в аккаунт, чтобы продолжить.</p>
          <Link className="text-emerald-400 underline" href="/login">
            Перейти к входу
          </Link>
        </div>
      </Card>
    );
  }

  return <>{children}</>;
}
