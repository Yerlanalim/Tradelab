import { ArrowRight, Shield, TrendingUp, Zap } from "lucide-react";

export function HeroSection() {
  return (
    <div className="mb-8">
      <div className="relative ui-glass-panel-strong rounded-3xl p-8 overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
        <div className="absolute inset-0 bg-linear-to-br from-emerald-500/10 via-transparent to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

        <div className="relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 backdrop-blur-sm rounded-full border border-emerald-500/30 mb-6">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-emerald-300">
                AI-powered intelligence
              </span>
            </div>

            <h1 className="text-5xl font-bold mb-4 text-white leading-tight">
              Инструменты для работы
              <br />
              <span className="bg-linear-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                с китайскими поставщиками
              </span>
            </h1>

            <p className="text-white/70 text-lg mb-8 leading-relaxed">
              Проверяйте компании, анализируйте рынки и находите надёжных
              партнёров в Китае с помощью AI и verified data
            </p>

            <button className="group/btn inline-flex items-center gap-3 px-6 py-4 bg-linear-to-r from-[#10B981] to-[#059669] rounded-xl font-semibold text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 hover:scale-105">
              Начать бесплатно
              <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="flex gap-8 mt-10">
            <div className="flex items-start gap-3 group/stat">
              <div className="w-12 h-12 bg-linear-to-br from-emerald-500/20 to-emerald-500/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-emerald-500/30 group-hover/stat:border-emerald-500/50 transition-all">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">2000+</div>
                <div className="text-sm text-white/60">Отчётов создано</div>
              </div>
            </div>

            <div className="flex items-start gap-3 group/stat">
              <div className="w-12 h-12 bg-linear-to-br from-blue-500/20 to-blue-500/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-blue-500/30 group-hover/stat:border-blue-500/50 transition-all">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">QCC Data</div>
                <div className="text-sm text-white/60">
                  Проверенные источники
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 group/stat">
              <div className="w-12 h-12 bg-linear-to-br from-purple-500/20 to-purple-500/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-purple-500/30 group-hover/stat:border-purple-500/50 transition-all">
                <Zap className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">5 минут</div>
                <div className="text-sm text-white/60">Получите отчёт</div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-8 pt-6 border-t border-white/10 flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm text-white/50">
            <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            Данные из QCC
          </div>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            Tendata verified
          </div>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            Защита данных
          </div>
        </div>
      </div>
    </div>
  );
}
