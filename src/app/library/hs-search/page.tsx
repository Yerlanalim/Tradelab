"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { Search, Hash, Info, ExternalLink, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

interface HSCodeRecord {
  code: string;
  name: string;
  path: string;
  tariff_clean: string;
  score: number;
}

export default function HSSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HSCodeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query || query.length < 3) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const port = 3002;
        const response = await fetch(`http://localhost:${port}/hs/search?q=${encodeURIComponent(query)}&limit=20`);
        const data = await response.json();
        
        if (data.results) {
          setResults(data.results);
        } else if (data.exact) {
          setResults([data.exact]);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error("HS Search error:", err);
        setError("Не удалось подключиться к сервису поиска. Убедитесь, что сервис запущен на порту 3002.");
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <AppShell
      title="Поиск HS кода (ТНВЭД)"
      description="Справочник кодов товарной номенклатуры внешнеэкономической деятельности ЕАЭС."
    >
      <Section title="Поиск по базе" description="Введите название товара или числовой код для поиска тарифов и описаний.">
        <div className="max-w-4xl">
          <div className="relative mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-white/40" />
            <input
              type="text"
              placeholder="Например: электросамокаты, лошади, 0101..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 pl-14 pr-4 text-xl text-white placeholder:text-white/20 focus:outline-hidden focus:border-emerald-500/50 focus:bg-white/10 transition-all font-medium"
            />
            {isLoading && (
              <div className="absolute right-6 top-1/2 -translate-y-1/2">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            {!query && (
              <div className="ui-glass-panel rounded-3xl p-12 text-center border-dashed">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Hash className="w-8 h-8 text-white/20" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Готов к поиску</h3>
                <p className="text-white/40 max-w-sm mx-auto">
                  Используйте полнотекстовый поиск по описанию или введите первые цифры кода ТНВЭД.
                </p>
              </div>
            )}

            {query && query.length < 3 && !isLoading && (
              <div className="text-center py-8 text-white/40">
                Введите как минимум 3 символа...
              </div>
            )}

            {results.map((item, idx) => (
              <div 
                key={item.code + idx}
                className="ui-glass-panel rounded-2xl p-6 hover:border-emerald-500/30 transition-all group"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-mono font-bold tracking-wider border border-emerald-500/20">
                        {item.code}
                      </span>
                      {item.tariff_clean && (
                        <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-sm font-bold border border-blue-500/20">
                          Импортная пошлина: {item.tariff_clean}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 group-hover:text-emerald-300 transition-colors">
                      {item.name}
                    </h3>
                    {item.path && (
                      <div className="flex items-start gap-2 text-sm text-white/40">
                        <Info className="w-4 h-4 mt-1 flex-shrink-0" />
                        <span>{item.path}</span>
                      </div>
                    )}
                  </div>
                  <button className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium text-white transition-all border border-white/10">
                    Подробнее
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {query.length >= 3 && !isLoading && results.length === 0 && !error && (
              <div className="ui-glass-panel rounded-3xl p-12 text-center">
                <p className="text-white/40">По запросу "{query}" результатов не найдено.</p>
              </div>
            )}

            {error && (
              <div className="ui-glass-panel rounded-3xl p-12 text-center border-red-500/20">
                <p className="text-red-400">{error}</p>
              </div>
            )}
          </div>
        </div>
      </Section>
    </AppShell>
  );
}
