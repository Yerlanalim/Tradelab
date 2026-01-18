"use client";

import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { ConversationalForm } from "@/components/forms/ConversationalForm";
import { useSupabaseAuth } from "@/lib/auth/supabaseAuth";
import { runReportFlow } from "@/lib/api/reportFlow";

export default function CompanyCheckPage() {
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
        USCC: values.uscc ?? "",
        Компания: values.companyName ?? "",
      };
      const result = await runReportFlow({
        userId: user.id,
        productType: "p1",
        price: 20,
        title: "Справка о компании",
        summary: "Юридическая проверка поставщика по USCC.",
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
      title="Продукт 1 — Справка о компании"
      description="Юридическая проверка поставщика по USCC."
    >
      <Section
        title="Conversational Form"
        description="Подготовка данных перед запуском отчета."
      >
        <ConversationalForm
          title="Проверка компании (QCC)"
          description="Введите USCC и получите юридическую справку."
          steps={[
            "Запрос USCC и проверка формата",
            "Подтверждение данных поставщика",
            "Генерация справки и интерпретации",
          ]}
          fields={[
            {
              name: "uscc",
              label: "USCC (18 символов)",
              placeholder: "91440300MA5EQXXX0X",
              required: true,
              hint: "Используйте Unified Social Credit Code из документов поставщика.",
            },
            {
              name: "companyName",
              label: "Название компании (опционально)",
              placeholder: "Shenzhen Example Co., Ltd",
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
