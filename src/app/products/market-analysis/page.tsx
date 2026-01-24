import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { Card } from "@/components/ui/Card";

export default function MarketAnalysisPage() {
  return (
    <AppShell
      title="Продукт 4 — Анализ рынка KZ"
      description="Реальные поставки, диапазоны цен и инсайты."
    >
      <Section title="Единый бот TradeLab">
        <Card
          title="Запуск отчета через чат"
          description="Опишите категорию, HS‑код и период — бот подготовит анализ рынка."
        >
          <div className="space-y-3 text-sm text-white/70">
            <p>Используйте чат справа, чтобы запустить анализ рынка.</p>
            <p>
              Пример запроса: «Анализ рынка по категории мебель, HS‑код 9403, период
              12 мес., страна назначения KZ».
            </p>
          </div>
        </Card>
      </Section>
    </AppShell>
  );
}
