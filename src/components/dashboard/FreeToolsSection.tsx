"use client";

import { AlertTriangle, Calculator, Hash, Sparkles } from "lucide-react";
import Link from "next/link";

const freeTools = [
  {
    id: 1,
    title: "Калькулятор доставки",
    description: "Рассчитайте стоимость доставки из Китая в страны ЕАЭС",
    icon: Calculator,
    badge: "Бесплатно",
    badgeColor: "from-emerald-500 to-emerald-600",
    href: "/library/hs-search", // Пока ведем сюда же для демонстрации
  },
  {
    id: 2,
    title: "Поиск HS кода",
    description: "Найдите товарный код для таможенного оформления",
    icon: Hash,
    badge: "Бесплатно",
    badgeColor: "from-blue-500 to-blue-600",
    href: "/library/hs-search",
  },
  {
    id: 3,
    title: "Оценка рисков",
    description: "AI-бот для предварительной оценки надёжности поставщика",
    icon: AlertTriangle,
    badge: "Beta",
    badgeColor: "from-purple-500 to-purple-600",
    href: "/products/company-check",
  },
];

const badgeGradient: Record<string, string> = {
  "from-emerald-500 to-emerald-600": "from-emerald-500 to-emerald-600",
  "from-blue-500 to-blue-600": "from-blue-500 to-blue-600",
  "from-purple-500 to-purple-600": "from-purple-500 to-purple-600",
};

export function FreeToolsSection() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">
          Бесплатные инструменты
        </h2>
        <p className="text-white/60 text-lg">
          Попробуйте наши сервисы без регистрации
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {freeTools.map((tool) => (
          <Link
            key={tool.id}
            href={tool.href}
            className="group relative ui-glass-panel rounded-2xl p-6 hover:border-emerald-500/50 transition-all duration-300 cursor-pointer overflow-hidden hover:scale-[1.01]"
          >
            <div className="absolute inset-0 bg-linear-to-br from-emerald-500/10 via-transparent to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-sm group-hover:bg-linear-to-br group-hover:from-emerald-500 group-hover:to-emerald-600 rounded-2xl flex items-center justify-center transition-all duration-300 border border-white/20 group-hover:border-emerald-500/50 group-hover:shadow-lg group-hover:shadow-emerald-500/30">
                  <tool.icon className="w-6 h-6 text-white/80 group-hover:text-white transition-colors" />
                </div>
                <span
                  className={`text-xs font-bold px-3 py-1.5 bg-linear-to-r ${badgeGradient[tool.badgeColor]} text-white rounded-full shadow-lg flex items-center gap-1`}
                >
                  {tool.badge === "Beta" && <Sparkles className="w-3 h-3" />}
                  {tool.badge}
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                {tool.title}
              </h3>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                {tool.description}
              </p>

              <div className="text-emerald-400 font-semibold text-sm hover:text-emerald-300 transition-colors flex items-center gap-2 group/link">
                Попробовать
                <span className="group-hover/link:translate-x-1 transition-transform">
                  →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
