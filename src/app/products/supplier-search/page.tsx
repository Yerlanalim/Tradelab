"use client";

import { AppShell } from "@/components/layout/AppShell";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default function SupplierSearchPage() {
  return (
    <AppShell
      title="Продукт 3 — Поиск поставщиков"
      description="Единый бот в режиме Supplier Search."
      chatVariant="hidden"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/80">
          <div className="text-xs font-semibold uppercase text-white/50">Что это за продукт</div>
          <div className="mt-2 text-lg text-white">
            Поиск поставщиков с оценкой рисков и ценовым бенчмарком
          </div>
          <p className="mt-2 text-sm text-white/60">
            Сначала вы получаете бесплатный preview (обычно 5 примеров), затем подтверждаете запуск
            полного анализа за 500 TC. Если источников мало — покажем предупреждение, списаний нет.
          </p>
          <div className="mt-4 grid gap-3 text-sm text-white/70 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <div className="text-xs text-white/50">Стоимость</div>
              <div className="text-white">500 TC за полный отчёт</div>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <div className="text-xs text-white/50">Что внутри</div>
              <div className="text-white">10 поставщиков + светофор</div>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <div className="text-xs text-white/50">Формат</div>
              <div className="text-white">Результат в чате + отчёт</div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-white/70 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 px-3 py-2">1. Параметры</div>
            <div className="rounded-xl bg-white/10 px-3 py-2">2. Preview</div>
            <div className="rounded-xl bg-white/10 px-3 py-2">3. Подтверждение</div>
          </div>
        </div>
        <ChatPanel variant="center" />
      </div>
    </AppShell>
  );
}
