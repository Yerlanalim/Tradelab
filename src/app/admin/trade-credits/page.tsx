"use client";

import { useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { grantTcBonus } from "@/lib/api/tc";
import { dispatchTcBalanceUpdate } from "@/lib/events/tcBalance";
import { supabaseClient } from "@/lib/supabase/client";

export default function AdminTradeCreditsPage() {
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("250");
  const [creditType, setCreditType] = useState<"bonus" | "promo" | "welcome" | "purchased">(
    "bonus"
  );
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        setIsAllowed(false);
        setMessage("Требуется вход в аккаунт.");
        return;
      }
      try {
        const response = await fetch("/api/admin/access", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = (await response.json()) as {
          ok: boolean;
          is_admin?: boolean;
          message?: string;
        };
        if (!response.ok || !payload.ok) {
          setIsAllowed(false);
          setMessage(payload.message ?? "Доступ запрещен.");
          return;
        }
        setIsAllowed(Boolean(payload.is_admin));
        if (!payload.is_admin) {
          setMessage("Доступ запрещен.");
        }
      } catch (error) {
        setIsAllowed(false);
        setMessage(error instanceof Error ? error.message : "Ошибка проверки доступа.");
      }
    };
    load();
  }, []);

  if (isAllowed === false) {
    return (
      <AppShell title="Admin: Trade Credits" description="Доступ ограничен.">
        <Section title="Доступ" description="Требуются права admin.">
          <Card title="Нет доступа" description="Свяжитесь с администратором.">
            <div className="text-sm text-white/70">{message ?? "Доступ запрещен."}</div>
          </Card>
        </Section>
      </AppShell>
    );
  }
  if (isAllowed === null) {
    return (
      <AppShell title="Admin: Trade Credits" description="Проверка доступа.">
        <Section title="Проверка" description="Загружаем данные пользователя.">
          <Card title="Пожалуйста, подождите" description="Проверяем права доступа.">
            <div className="text-sm text-white/70">Загрузка...</div>
          </Card>
        </Section>
      </AppShell>
    );
  }

  const handleSubmit = async () => {
    if (!userId.trim()) {
      setMessage("Укажите user_id.");
      setStatus("error");
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage("Некорректная сумма.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const response = await grantTcBonus({
        userId: userId.trim(),
        amount: numericAmount,
        creditType,
        reason: "admin_bonus",
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      if (response.ok) {
        setStatus("success");
        setMessage(`Готово. Баланс: ${response.balance_total ?? "—"} TC`);
        dispatchTcBalanceUpdate();
      } else {
        setStatus("error");
        setMessage(response.message ?? "Не удалось выдать бонус.");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Ошибка запроса.");
    }
  };

  return (
    <AppShell title="Admin: Trade Credits" description="Ручная выдача бонусов.">
      <Section title="Выдача бонусов" description="Доступно только для admin.">
        <Card title="Admin grant" description="Используйте user_id из auth.users.">
          <div className="space-y-4 text-sm text-white/80">
            <div>
              <label className="text-xs text-white/60">User ID</label>
              <input
                className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/80 placeholder:text-white/40"
                placeholder="uuid пользователя"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-white/60">Сумма TC</label>
                <input
                  className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/80 placeholder:text-white/40"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-white/60">Тип</label>
                <select
                  className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/80"
                  value={creditType}
                  onChange={(event) =>
                    setCreditType(event.target.value as typeof creditType)
                  }
                >
                  <option value="bonus">bonus</option>
                  <option value="promo">promo</option>
                  <option value="welcome">welcome</option>
                  <option value="purchased">purchased</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-white/60">Expires at (optional)</label>
              <input
                type="date"
                className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/80"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
            <Button onClick={handleSubmit} disabled={status === "loading"}>
              {status === "loading" ? "Выдаем..." : "Выдать бонус"}
            </Button>
            {message && (
              <div
                className={`text-xs ${
                  status === "error" ? "text-rose-200" : "text-emerald-200"
                }`}
              >
                {message}
              </div>
            )}
          </div>
        </Card>
      </Section>
    </AppShell>
  );
}
