"use client";

import { useState, useEffect } from "react";
import { Search, X, Hash, Info, ExternalLink, Loader2 } from "lucide-react";

interface HSCodeRecord {
  code: string;
  name: string;
  path: string;
  tariff_clean: string;
  score: number;
}

interface HSSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HSSearchModal({ isOpen, onClose }: HSSearchModalProps) {
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
        const port = 3002; // Специальный порт для TNVED сервиса
        const response = await fetch(`http://localhost:${port}/hs/search?q=${encodeURIComponent(query)}&limit=10`);
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
        setError("Не удалось подключиться к сервису поиска");
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="relative w-full max-w-2xl ui-glass-panel-strong rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
              <Hash className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Поиск HS кода</h2>
              <p className="text-sm text-white/50">База ТНВЭД ЕАЭС 2024</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              autoFocus
              type="text"
              placeholder="Введите название товара или код (мин. 3 символа)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-hidden focus:border-blue-500/50 focus:bg-white/10 transition-all font-medium"
            />
            {isLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              </div>
            )}
          </div>

          {/* Results Area */}
          <div className="mt-6 max-h-[400px] overflow-y-auto custom-scrollbar">
            {!query && (
              <div className="text-center py-12 text-white/40">
                <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Начните вводить текст для поиска</p>
              </div>
            )}

            {query && query.length < 3 && !isLoading && (
              <div className="text-center py-12 text-white/40 font-medium">
                <p>Минимум 3 символа для поиска</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-3 pb-4">
                {results.map((item, idx) => (
                  <div 
                    key={item.code + idx}
                    className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-blue-500/30 hover:bg-white/10 transition-all group cursor-default"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-mono font-bold tracking-wider">
                          {item.code}
                        </span>
                        {item.tariff_clean && (
                          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-xs font-bold">
                            Доцент: {item.tariff_clean}
                          </span>
                        )}
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all text-white/40 hover:text-white">
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-white/90 leading-relaxed">
                      {item.name}
                    </p>
                    {item.path && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-white/40">
                        <Info className="w-3 h-3" />
                        <span className="truncate">{item.path}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {query.length >= 3 && !isLoading && results.length === 0 && !error && (
              <div className="text-center py-12 text-white/40">
                <p>Ничего не найдено по запросу "{query}"</p>
              </div>
            )}

            {error && (
              <div className="text-center py-12 text-red-400">
                <p>{error}</p>
                <button 
                  onClick={() => setQuery(query + " ")}
                  className="mt-4 text-sm font-bold text-white hover:underline"
                >
                  Попробовать еще раз
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white/5 border-t border-white/10 flex justify-between items-center text-[11px] text-white/30">
          <p>Данные предоставлены TradeLab HS Microservice</p>
          <div className="flex items-center gap-3">
            <span>ESC для выхода</span>
          </div>
        </div>
      </div>
    </div>
  );
}
