"use client";

import { Bell, Command, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchTcBalance } from "@/lib/api/tc";
import { onTcBalanceUpdate } from "@/lib/events/tcBalance";

const languages = ["RU", "EN", "中文"];

export function TopBar() {
  const [language, setLanguage] = useState("RU");
  const [tcBalance, setTcBalance] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const data = await fetchTcBalance();
        if (isMounted) {
          setTcBalance(data.balance_total);
        }
      } catch {
        if (isMounted) {
          setTcBalance(null);
        }
      }
    };
    load();
    const unsubscribe = onTcBalanceUpdate(load);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        load();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    const interval = window.setInterval(load, 60000);
    return () => {
      isMounted = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="backdrop-blur-xl bg-white/5 border-b border-white/10 px-8 py-4">
      <div className="flex items-center gap-6">
        <div className="flex-1 max-w-2xl">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-hover:text-emerald-400 transition-colors" />
            <input
              type="text"
              placeholder="Поиск компаний, продуктов, HS кодов..."
              className="w-full pl-12 pr-20 py-3.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:bg-white/15 text-sm text-white placeholder-white/40 transition-all"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 bg-white/10 rounded-lg">
              <Command className="w-3 h-3 text-white/40" />
              <span className="text-xs text-white/40">K</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/70">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span>{tcBalance !== null ? `${tcBalance} TC` : "TC —"}</span>
          </div>
          <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-1">
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  language === lang
                    ? "bg-linear-to-r from-[#10B981] to-[#059669] text-white shadow-lg shadow-[#10B981]/30"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          <button className="relative p-3 hover:bg-white/10 rounded-xl transition-all duration-200 backdrop-blur-sm border border-white/20 group">
            <Bell className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-linear-to-r from-emerald-400 to-emerald-500 rounded-full animate-pulse"></span>
          </button>
        </div>
      </div>
    </div>
  );
}
