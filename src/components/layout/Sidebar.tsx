"use client";

import {
  Building2,
  Calendar,
  ChevronDown,
  FileText,
  Home,
  Map,
  Package,
  Settings,
  Sparkles,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Главная", icon: Home },
  {
    href: "/products",
    label: "Продукты",
    icon: Package,
    hasDropdown: true,
  },
  { href: "/map", label: "Карта Китая", icon: Map },
  { href: "/library", label: "Библиотека", icon: BookOpen },
  { href: "/zones", label: "Торговые зоны", icon: Building2 },
  { href: "/exhibitions", label: "Выставки", icon: Calendar },
  { href: "/reports", label: "Мои отчёты", icon: FileText },
  { href: "/trade-credits", label: "Trade Credits", icon: Sparkles },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isProductsOpen, setIsProductsOpen] = useState(false);

  return (
    <aside className="hidden border-r border-white/10 bg-linear-to-br from-[#0f172a] to-[#111c34] text-white lg:flex lg:flex-col">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-linear-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 relative">
            <Sparkles className="w-5 h-5 text-white" />
            <div className="absolute inset-0 bg-linear-to-br from-white/20 to-transparent rounded-xl"></div>
          </div>
          <div>
            <div className="font-bold text-lg text-white tracking-tight">
              TradeLab
            </div>
            <div className="text-xs text-emerald-400 font-medium">
              Trade Intelligence
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href !== "/products"
                ? pathname === item.href
                : pathname.startsWith("/products");
            return (
              <div key={item.href}>
                {item.hasDropdown ? (
                  <button
                    onClick={() => {
                      setIsProductsOpen(!isProductsOpen);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? "bg-linear-to-r from-[#10B981] to-[#059669] text-white shadow-lg shadow-[#10B981]/30"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="flex-1 text-left text-sm font-medium">
                      {item.label}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        isProductsOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                ) : (
                  <Link
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? "bg-linear-to-r from-[#10B981] to-[#059669] text-white shadow-lg shadow-[#10B981]/30"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                    href={item.href}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="flex-1 text-left text-sm font-medium">
                      {item.label}
                    </span>
                  </Link>
                )}
                {item.hasDropdown && isProductsOpen && (
                  <div className="ml-12 mt-1 space-y-1">
                    <Link
                      className="block w-full text-left px-4 py-2 text-sm text-white/60 hover:text-white rounded-lg transition-colors"
                      href="/products/company-check"
                    >
                      Справка о компании
                    </Link>
                    <Link
                      className="block w-full text-left px-4 py-2 text-sm text-white/60 hover:text-white rounded-lg transition-colors"
                      href="/products/export-profile"
                    >
                      Экспортный профиль
                    </Link>
                    <Link
                      className="block w-full text-left px-4 py-2 text-sm text-white/60 hover:text-white rounded-lg transition-colors"
                      href="/products/supplier-search"
                    >
                      Поиск поставщиков
                    </Link>
                    <Link
                      className="block w-full text-left px-4 py-2 text-sm text-white/60 hover:text-white rounded-lg transition-colors"
                      href="/products/market-analysis"
                    >
                      Анализ рынка
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="p-4 border-t border-white/10">
        <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-all duration-200 group">
          <div className="relative">
            <div className="w-10 h-10 bg-linear-to-br from-[#10B981] to-[#059669] rounded-full flex items-center justify-center font-semibold text-white">
              АК
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#1A2B4A]"></div>
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium text-white">Алмас Кенжебаев</div>
            <div className="text-xs text-emerald-400 font-medium">Premium</div>
          </div>
        </button>
      </div>
    </aside>
  );
}
