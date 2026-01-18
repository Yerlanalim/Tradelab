"use client";

import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { ConversationalForm } from "@/components/forms/ConversationalForm";
import { useSupabaseAuth } from "@/lib/auth/supabaseAuth";
import { runReportFlow } from "@/lib/api/reportFlow";

export default function ExportProfilePage() {
  const { user } = useSupabaseAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (values: Record<string, string>) => {
    if (!user) {
      setMessage("Войдите в аккаунт, чтобы создать отчет.");
      return;
    }
    setMessage(null);
    setIsLoading(true);
    try {
      const meta = {
        Компания: values.companyName ?? "",
        USCC: values.uscc ?? "",
        "HS-код": values.hsCode ?? "",
        "Период (мес.)": values.period ?? "",
      };
      const result = await runReportFlow({
        userId: user.id,
        productType: "p2",
        price: 20,
        title: "Экспортный профиль",
        summary: "Анализ экспортной активности и релевантности сделки.",
        params: values,
        meta,
        source: "TradeLab (демо-данные)",
        limitation: "Результаты носят информационный характер.",
      });

      setMessage(
        result.ok
          ? "Отчет сформирован и доступен в разделе «Мои отчеты»."
          : result.message ?? "Ошибка генерации отчета."
      );
    } catch {
      setMessage("Ошибка генерации отчета.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppShell
      title="Продукт 2 — Экспортный профиль"
      description="Анализ экспортной активности и релевантности сделки."
    >
      <Section
        title="Conversational Form"
        description="Сбор параметров для отчета."
      >
        <ConversationalForm
          title="Экспортный профиль (Tendata)"
          description="Получите отчет об экспортной активности поставщика."
          steps={[
            "Уточнение компании (USCC или название)",
            "Выбор периода и HS-кода",
            "Формирование отчета и блока релевантности",
          ]}
          fields={[
            {
              name: "companyName",
              label: "Название компании",
              placeholder: "Shenzhen Example Co., Ltd",
              required: true,
            },
            {
              name: "uscc",
              label: "USCC (если есть)",
              placeholder: "91440300MA5EQXXX0X",
              hint: "USCC ускоряет поиск и снижает риск ошибки.",
            },
            {
              name: "hsCode",
              label: "HS-код (опционально)",
              placeholder: "8501",
            },
            {
              name: "period",
              label: "Период (мес.)",
              placeholder: "12",
              type: "number",
            },
          ]}
          primaryActionLabel={isLoading ? "Генерация..." : "Сформировать отчет"}
          onSubmit={handleSubmit}
        />
        {message && <div className="mt-3 text-xs text-white/60">{message}</div>}
      </Section>
    </AppShell>
  );
}
