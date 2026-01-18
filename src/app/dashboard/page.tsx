"use client";

import { useEffect, useState } from "react";

import { HeroSection } from "@/components/dashboard/HeroSection";
import { FreeToolsSection } from "@/components/dashboard/FreeToolsSection";
import { ProductsGrid } from "@/components/dashboard/ProductsGrid";
import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { fetchOrders } from "@/lib/api/orders";

export default function DashboardPage() {
  const [ordersCount, setOrdersCount] = useState<number>(0);

  useEffect(() => {
    const load = async () => {
      try {
        const orders = await fetchOrders();
        setOrdersCount(orders.length);
      } catch {
        setOrdersCount(0);
      }
    };
    load();
  }, []);

  return (
    <AppShell
      title="Главная"
      description="Ключевые метрики, статусы и быстрые действия."
    >
      <HeroSection />
      <ProductsGrid />
      <FreeToolsSection />

      <Section title="KPI и быстрые действия" description="Сводка по продуктам.">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Заказы" description="История пользователя">
            <div className="text-3xl font-semibold text-white">
              {ordersCount}
            </div>
          </Card>
          <Card title="Быстрые действия" description="План работ">
            <p className="text-sm text-white/70">
              Следующий шаг — подключение отчетов к реальным данным.
            </p>
          </Card>
          <Card title="AI-бот" description="Контекстный помощник">
            <p className="text-sm text-white/70">
              В этом блоке будет статус и конфигурация бота.
            </p>
          </Card>
        </div>
      </Section>

      <Section
        title="Статусы продуктов"
        description="Что доступно в текущем релизе."
        className="mt-6"
      >
        <Table
          headers={["Продукт", "Статус", "Цена"]}
          rows={[
            ["P1 — Проверка компании", "Скоро", "$20"],
            ["P2 — Экспортный профиль", "Скоро", "$20"],
            ["P3 — Поиск поставщиков", "Скоро", "$10"],
            ["P4 — Анализ рынка", "Скоро", "$50"],
          ]}
        />
      </Section>
    </AppShell>
  );
}
