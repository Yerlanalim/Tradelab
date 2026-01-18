"use client";

import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { ConversationalForm } from "@/components/forms/ConversationalForm";
import { useSupabaseAuth } from "@/lib/auth/supabaseAuth";
import { runReportFlow } from "@/lib/api/reportFlow";

export default function MarketAnalysisPage() {
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
        Категория: values.category ?? "",
        "HS-код": values.hsCode ?? "",
        Назначение: values.destination ?? "",
        "Период (мес.)": values.period ?? "",
      };
      const result = await runReportFlow({
        userId: user.id,
        productType: "p4",
        price: 50,
        title: "Анализ рынка поставок",
        summary: "Реальные поставки, диапазоны цен и инсайты.",
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
      title="Продукт 4 — Анализ рынка KZ"
      description="Реальные поставки, диапазоны цен и инсайты."
    >
      <Section
        title="Conversational Form"
        description="Сбор параметров для отчета."
      >
        <ConversationalForm
          title="Анализ рынка поставок"
          description="Отчет по реальным поставкам в Казахстан."
          steps={[
            "Категория товара и HS-код",
            "Период анализа и страна назначения",
            "Генерация insights и выводов",
          ]}
          primaryActionLabel={isLoading ? "Генерация..." : "Сформировать отчет"}
          fields={[
            {
              name: "category",
              label: "Категория/описание товара",
              placeholder: "электроника, мебель, текстиль",
              required: true,
            },
            {
              name: "hsCode",
              label: "HS-код (если известен)",
              placeholder: "9403",
            },
            {
              name: "destination",
              label: "Страна назначения",
              placeholder: "KZ",
            },
            {
              name: "period",
              label: "Период (мес.)",
              placeholder: "12",
              type: "number",
            },
          ]}
          onSubmit={handleSubmit}
        />
        {message && <div className="mt-3 text-xs text-white/60">{message}</div>}
      </Section>
    </AppShell>
  );
}
