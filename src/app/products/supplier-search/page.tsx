"use client";

import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { ConversationalForm } from "@/components/forms/ConversationalForm";
import { Product3Search } from "@/components/products/Product3Search";

export default function SupplierSearchPage() {
  const [query, setQuery] = useState("");
  const [searchToken, setSearchToken] = useState(0);

  const handleSearch = (values: Record<string, string>) => {
    const parts = [
      values.product,
      values.attributes,
      values.hsCode ? `HS ${values.hsCode}` : "",
      values.budget ? `budget ${values.budget}` : "",
    ]
      .map((part) => part?.trim())
      .filter(Boolean);
    setQuery(parts.join(", "));
    setSearchToken((prev) => prev + 1);
  };

  return (
    <AppShell
      title="Продукт 3 — Поиск поставщиков"
      description="Список релевантных кандидатов и бенчмарки."
    >
      <Section
        title="Conversational Form"
        description="Уточнение запроса перед поиском."
      >
        <ConversationalForm
          title="Поиск поставщиков (Apify)"
          description="Соберите список релевантных поставщиков по запросу."
          steps={[
            "Описание товара и ключевых атрибутов",
            "Подбор HS-кода и ключевых терминов",
            "Поиск, фильтрация, benchmark",
          ]}
          primaryActionLabel="Найти поставщиков"
          fields={[
            {
              name: "product",
              label: "Описание товара",
              placeholder: "LED light, phone case, ceramic tiles",
              required: true,
            },
            {
              name: "attributes",
              label: "Ключевые атрибуты",
              placeholder: "материал, размер, стандарт",
            },
            {
              name: "hsCode",
              label: "HS-код (опционально)",
              placeholder: "8517",
            },
            {
              name: "budget",
              label: "Бюджет/цена (опционально)",
              placeholder: "от 1.2 USD/шт",
            },
          ]}
          onSubmit={handleSearch}
        />
      </Section>
      <Section
        title="Результаты"
        description="Только релевантные предложения."
        className="mt-6"
      >
        <Product3Search
          query={query}
          onQueryChange={setQuery}
          searchToken={searchToken}
        />
      </Section>
    </AppShell>
  );
}
