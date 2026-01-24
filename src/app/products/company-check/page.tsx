import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { Card } from "@/components/ui/Card";

export default function CompanyCheckPage() {
  return (
    <AppShell
      title="Продукт 1 — Справка о компании"
      description="Юридическая проверка поставщика по USCC."
    >
      <Section title="Единый бот TradeLab">
        <Card
          title="Запуск отчета через чат"
          description="Опишите поставщика и укажите USCC — бот уточнит детали и сформирует отчет."
        >
          <div className="space-y-3 text-sm text-white/70">
            <p>Используйте чат справа, чтобы запустить проверку компании.</p>
            <p>
              Пример запроса: «Нужна справка по компании с USCC 91440300MA5EQXXX0X».
            </p>
          </div>
        </Card>
      </Section>
    </AppShell>
  );
}
