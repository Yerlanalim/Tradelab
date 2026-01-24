"use client";

import { AppShell } from "@/components/layout/AppShell";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { Section } from "@/components/layout/Section";

export default function SupplierSearchPage() {
  return (
    <AppShell
      title="Продукт 3 — Поиск поставщиков"
      description="Единый бот в режиме Supplier Search."
    >
      <Section title="Поиск поставщиков" description="Запуск через единый чат.">
        <PagePlaceholder
          title="Supplier Search Bot"
          description="Откройте чат в боковой панели и опишите, что ищете."
        />
      </Section>
    </AppShell>
  );
}
