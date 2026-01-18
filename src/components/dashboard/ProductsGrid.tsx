import {
  ArrowRight,
  BarChart3,
  FileCheck,
  Search,
  TrendingUp,
} from "lucide-react";

const products = [
  {
    id: 1,
    title: "Справка о компании",
    description:
      "Полная проверка китайской компании: регистрация, финансы, судебные дела, патенты",
    price: 20,
    icon: FileCheck,
    gradient: "from-blue-500 to-blue-600",
    glowColor: "blue-500",
    size: "large",
  },
  {
    id: 2,
    title: "Экспортный профиль",
    description:
      "История экспорта компании: страны, объёмы, покупатели, динамика поставок",
    price: 20,
    icon: TrendingUp,
    gradient: "from-emerald-500 to-emerald-600",
    glowColor: "emerald-500",
    size: "large",
  },
  {
    id: 3,
    title: "Поиск поставщиков",
    description: "База экспортёров по продукту или HS коду",
    price: 10,
    icon: Search,
    gradient: "from-purple-500 to-purple-600",
    glowColor: "purple-500",
    size: "small",
  },
  {
    id: 4,
    title: "Анализ рынка",
    description: "Анализ конкурентов, цен, тенденций",
    price: 50,
    icon: BarChart3,
    gradient: "from-orange-500 to-orange-600",
    glowColor: "orange-500",
    size: "small",
  },
];

const glowBorder: Record<string, string> = {
  "blue-500": "hover:border-blue-500/50",
  "emerald-500": "hover:border-emerald-500/50",
  "purple-500": "hover:border-purple-500/50",
  "orange-500": "hover:border-orange-500/50",
};

const glowBg: Record<string, string> = {
  "blue-500": "from-blue-500/20",
  "emerald-500": "from-emerald-500/20",
  "purple-500": "from-purple-500/20",
  "orange-500": "from-orange-500/20",
};

const glowShadow: Record<string, string> = {
  "blue-500": "shadow-blue-500/25 group-hover:shadow-blue-500/40",
  "emerald-500": "shadow-emerald-500/25 group-hover:shadow-emerald-500/40",
  "purple-500": "shadow-purple-500/25 group-hover:shadow-purple-500/40",
  "orange-500": "shadow-orange-500/25 group-hover:shadow-orange-500/40",
};

export function ProductsGrid() {
  return (
    <div className="mb-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Наши продукты</h2>
        <p className="text-white/60 text-lg">
          Профессиональные инструменты для анализа китайского рынка
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {products.map((product) => (
          <div
            key={product.id}
            className={`${
              product.size === "large" ? "col-span-1 row-span-2" : "col-span-1"
            } group relative ui-glass-panel rounded-2xl p-6 ${glowBorder[product.glowColor]} transition-all duration-300 overflow-hidden hover:scale-[1.01]`}
          >
            <div
              className={`absolute inset-0 bg-linear-to-br ${glowBg[product.glowColor]} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
            ></div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`w-14 h-14 bg-linear-to-br ${product.gradient} rounded-2xl flex items-center justify-center shadow-lg ${glowShadow[product.glowColor]} transition-all`}
                >
                  <product.icon className="w-7 h-7 text-white" />
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-white">
                    ${product.price}
                  </div>
                  <div className="text-xs text-white/50">за отчёт</div>
                </div>
              </div>

              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-2">
                  {product.title}
                </h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  {product.description}
                </p>
              </div>

              <button
                className={`mt-6 w-full bg-linear-to-r ${product.gradient} text-white py-3 px-4 rounded-xl font-semibold hover:shadow-lg ${glowShadow[product.glowColor]} transition-all duration-300 flex items-center justify-center gap-2 group/btn`}
              >
                Заказать отчёт
                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
