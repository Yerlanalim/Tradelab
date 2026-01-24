import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { Card } from "@/components/ui/Card";

export default function ExportProfilePage() {
  return (
    <AppShell
      title="Продукт 2 — Экспортный профиль"
      description="Анализ экспортной активности и релевантности сделки."
    >
      <Section title="Единый бот TradeLab">
        <Card
          title="Запуск отчета через чат"
          description="Опишите компанию, период и HS‑код — бот уточнит параметры и подготовит отчет."
        >
          <div className="space-y-3 text-sm text-white/70">
            <p>Используйте чат справа, чтобы запустить экспортный профиль.</p>
            <p>
              Пример запроса: «Экспортный профиль для Shenzhen Example Co., Ltd, HS‑код
              8501, период 12 мес.»
            </p>
          </div>
        </Card>
      </Section>
    </AppShell>
  );
}
