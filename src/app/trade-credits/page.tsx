"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/layout/Section";
import { Table } from "@/components/ui/Table";
import { fetchTcBalance, fetchTcLedger } from "@/lib/api/tc";

export default function TradeCreditsPage() {
  const [balance, setBalance] = useState({
    balance_total: 0,
    balance_purchased: 0,
    balance_bonus: 0,
    balance_promo: 0,
    balance_welcome: 0,
    next_expiry: null as string | null,
  });
  const [ledger, setLedger] = useState<
    {
      id: string;
      tx_type: "credit" | "debit";
      amount: number;
      credit_type: string | null;
      reason: string | null;
      created_at: string;
    }[]
  >([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setStatus("loading");
      setErrorMessage(null);
      try {
        const [balanceData, ledgerData] = await Promise.all([
          fetchTcBalance(),
          fetchTcLedger(),
        ]);
        setBalance(balanceData);
        setLedger(ledgerData);
        setStatus("idle");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Неизвестная ошибка.");
        setStatus("error");
      }
    };
    load();
  }, []);

  const formattedExpiry = useMemo(() => {
    if (!balance.next_expiry) return "—";
    return new Date(balance.next_expiry).toLocaleDateString("ru-RU");
  }, [balance.next_expiry]);

  return (
    <AppShell title="Trade Credits" description="Баланс и история операций TC.">
      <Section title="Баланс" description="Сводка по типам TC.">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Всего" description="Все доступные TC">
            <div className="text-3xl font-semibold text-white">
              {balance.balance_total} TC
            </div>
          </Card>
          <Card title="Purchased" description="Без срока">
            <div className="text-2xl font-semibold text-white">
              {balance.balance_purchased} TC
            </div>
          </Card>
          <Card title="Bonus/Promo" description="Срок действия">
            <div className="text-2xl font-semibold text-white">
              {balance.balance_bonus + balance.balance_promo + balance.balance_welcome} TC
            </div>
            <div className="mt-2 text-xs text-white/60">
              Ближайшее истечение: {formattedExpiry}
            </div>
          </Card>
        </div>
      </Section>

      <Section
        title="История операций"
        description="Последние списания и начисления."
        className="mt-6"
      >
        {status === "loading" ? (
          <div className="text-sm text-white/60">Загрузка...</div>
        ) : status === "error" ? (
          <div className="text-sm text-white/60">
            Не удалось загрузить историю.
            {errorMessage ? ` (${errorMessage})` : ""}
          </div>
        ) : ledger.length ? (
          <Table
            headers={["Тип", "Сумма", "Источник", "Причина", "Дата"]}
            rows={ledger.map((row) => [
              row.tx_type === "credit" ? "Начисление" : "Списание",
              `${row.amount} TC`,
              row.credit_type ?? "—",
              row.reason ?? "—",
              new Date(row.created_at).toLocaleString("ru-RU"),
            ])}
          />
        ) : (
          <div className="text-sm text-white/60">Операций пока нет.</div>
        )}
      </Section>
    </AppShell>
  );
}
