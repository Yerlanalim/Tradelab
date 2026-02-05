"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { 
  Calculator, 
  Truck, 
  ShieldCheck, 
  AlertCircle, 
  Info, 
  ArrowRight,
  TrendingUp,
  Globe,
  DollarSign,
  Scale,
  Loader2,
  ChevronRight,
  PackageCheck
} from "lucide-react";
import { useState, useEffect } from "react";
import dynamic from 'next/dynamic';
import { calculateLandedCost, type DealPassport, type CalculationPackage as CalcResult } from "@/lib/api/calc";
import { SUPPORTED_COUNTRIES } from "@/lib/constants/countries";
import { CalculatorPDF } from "@/components/pdf/CalculatorPDF";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  { ssr: false }
);

export default function LogisticsCalculatorPage() {
  const [formData, setFormData] = useState<DealPassport>({
    dest_country: 'KZ',
    incoterms: 'CIF',
    goods_value: 1000,
    currency: 'USD',
    weight_gross_kg: 50,
    hs_code: '',
  });

  const [result, setResult] = useState<CalcResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'goods_value' || name === 'weight_gross_kg' ? parseFloat(value) || 0 : value
    }));
  };

  const [isClient, setIsClient] = useState(false);
  const [orderInProgress, setOrderInProgress] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleCreateOrder = async () => {
    setOrderInProgress(true);
    // Имитация создания заказа/заявки в CRM
    await new Promise(resolve => setTimeout(resolve, 1500));
    setOrderInProgress(false);
    setOrderSuccess(true);
    setTimeout(() => setOrderSuccess(false), 5000);
  };

  const handleCalculate = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await calculateLandedCost(formData as any);

      if (data.status === 'incomplete') {
        setError(`Missing required inputs: ${data.all_missing_inputs.join(', ')}`);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      console.error("Calculation error:", err);
      setError("Не удалось выполнить расчёт. Убедитесь, что бэкенд запущен на порту 3001.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppShell
      title="Калькулятор доставки и Landed Cost"
      description="Рассчитайте полную стоимость импорта товара (логистика + пошлины + НДС)."
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Input Form */}
        <div className="xl:col-span-1 space-y-6">
          <Section title="Параметры сделки" description="Введите данные для расчёта.">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 ml-1">Страна назначения</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                  <select 
                    name="dest_country"
                    value={formData.dest_country}
                    onChange={handleInputChange}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white focus:border-emerald-500/50 focus:outline-hidden appearance-none"
                  >
                    {SUPPORTED_COUNTRIES.map(country => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.name} ({country.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 ml-1">Incoterms</label>
                <select 
                  name="incoterms"
                  value={formData.incoterms}
                  onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-emerald-500/50 focus:outline-hidden"
                >
                  <option value="EXW">EXW (Китай)</option>
                  <option value="FOB">FOB (Китай)</option>
                  <option value="CIF">CIF (Граница/Порт)</option>
                  <option value="DAP">DAP (Пункт назначения)</option>
                  <option value="DDP">DDP (С пошлиной)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white/50 uppercase mb-2 ml-1">Стоимость товара</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                    <input 
                      type="number"
                      name="goods_value"
                      value={formData.goods_value}
                      onChange={handleInputChange}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white focus:border-emerald-500/50 focus:outline-hidden"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/50 uppercase mb-2 ml-1">Валюта</label>
                  <select 
                    name="currency"
                    value={formData.currency}
                    onChange={handleInputChange}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-emerald-500/50 focus:outline-hidden"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="CNY">CNY</option>
                    <option value="RUB">RUB</option>
                    <option value="KZT">KZT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 ml-1">Вес товара (брутто, кг)</label>
                <div className="relative">
                  <Scale className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                  <input 
                    type="number"
                    name="weight_gross_kg"
                    value={formData.weight_gross_kg}
                    onChange={handleInputChange}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white focus:border-emerald-500/50 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 ml-1">Код ТНВЭД (HS Code)</label>
                <input 
                  type="text"
                  name="hs_code"
                  placeholder="Напр. 8711601000"
                  value={formData.hs_code}
                  onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-emerald-500/50 focus:outline-hidden"
                />
              </div>

              <button 
                onClick={handleCalculate}
                disabled={isLoading}
                className="w-full bg-linear-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Рассчитать Landed Cost
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </Section>

          {error && (
            <div className="ui-glass-panel border-red-500/20 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="xl:col-span-2 space-y-6">
          {!result && !isLoading && !error && (
            <div className="h-full min-h-[400px] ui-glass-panel border-dashed p-12 flex flex-col items-center justify-center text-center rounded-3xl">
              <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6">
                <Calculator className="w-10 h-10 text-white/20" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Готов к расчёту</h3>
              <p className="text-white/40 max-w-sm mx-auto">
                Введите параметры сделки слева и нажмите кнопку для получения детальной сметы импорта.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="h-full min-h-[400px] ui-glass-panel p-12 flex flex-col items-center justify-center text-center rounded-3xl">
              <Loader2 className="w-12 h-12 text-emerald-400 animate-spin mb-6" />
              <p className="text-white/60 animate-pulse">Собираю тарифы, считаю пошлины...</p>
            </div>
          )}

          {result && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Summary Hero */}
              <div className="ui-glass-panel p-8 rounded-3xl bg-linear-to-br from-emerald-500/10 via-transparent to-blue-500/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8">
                  <div className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    result.confidence_level === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
                    result.confidence_level === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    Confidence: {result.confidence_level}
                  </div>
                </div>

                <div className="relative z-10">
                  <h3 className="text-emerald-400 font-bold text-sm uppercase mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Общая стоимость (Landed Cost)
                  </h3>
                  <div className="text-5xl font-bold text-white mb-4">
                    ${(result.totals.landed_cost_range_usd?.[0] || 0).toLocaleString()} – ${(result.totals.landed_cost_range_usd?.[1] || 0).toLocaleString()}
                  </div>
                  <p className="text-white/60 text-sm max-w-md">
                    Расчётная стоимость товара с учётом доставки до склада в {formData.dest_country} и всех таможенных платежей.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customs Details */}
                <div className="ui-glass-panel p-6 rounded-2xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Таможня и Налоги</h4>
                      <p className="text-xs text-white/40">Пошлины и НДС</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-end border-b border-white/5 pb-2">
                      <span className="text-white/60 text-sm">Пошлина:</span>
                      <span className="text-white font-mono font-bold">${result.duty_vat.duty.range_usd[0].toFixed(2)} – ${result.duty_vat.duty.range_usd[1].toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-end border-b border-white/5 pb-2">
                      <span className="text-white/60 text-sm">НДС ({(result.duty_vat.vat.rate * 100).toFixed(0)}%):</span>
                      <span className="text-white font-mono font-bold">${result.duty_vat.vat.range_usd[0].toFixed(2)} – ${result.duty_vat.vat.range_usd[1].toFixed(2)}</span>
                    </div>
                    {result.requires_escalation && (
                      <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg flex items-start gap-2 mt-4">
                        <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div className="text-[11px] text-yellow-200/80">
                          <p className="font-bold mb-1">Требуется доп. проверка:</p>
                          <ul className="list-disc pl-3 space-y-0.5">
                            {result.escalation_reasons.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Logistics Details */}
                <div className="ui-glass-panel p-6 rounded-2xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <Truck className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Логистика</h4>
                      <p className="text-xs text-white/40">Транспортные расходы</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {result.logistics.scenarios.map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group hover:border-emerald-500/30 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="text-xs font-bold text-emerald-400 uppercase">{s.mode}</div>
                          <div className="text-[11px] text-white/40">{s.transit_days_range[0]}-{s.transit_days_range[1]} дн.</div>
                        </div>
                        <div className="font-mono font-bold text-white">
                          ${s.cost_usd_range[0].toFixed(0)}-${s.cost_usd_range[1].toFixed(0)}
                        </div>
                      </div>
                    ))}
                    {result.logistics.scenarios.length === 0 && (
                      <div className="text-sm text-white/40 italic py-4">Нет данных по прямым тарифам</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Assumptions & Notes */}
              <div className="ui-glass-panel p-6 rounded-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <Info className="w-4 h-4 text-emerald-400" />
                  <h4 className="font-bold text-white text-sm">Допущения и ограничения</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                  {result.all_assumptions.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-white/50">
                      <ChevronRight className="w-3 h-3 mt-0.5 text-emerald-500/50" />
                      {a}
                    </div>
                  ))}
                  <div className="flex items-start gap-2 text-[11px] text-white/50">
                    <ChevronRight className="w-3 h-3 mt-0.5 text-emerald-500/50" />
                    Курсы валют на момент расчёта
                  </div>
                </div>
              </div>

              {/* Call to Action */}
              <div className="flex flex-col sm:flex-row justify-end gap-4 p-4">
                {orderSuccess && (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold animate-in fade-in slide-in-from-right-4">
                    <ShieldCheck className="w-4 h-4" />
                    Заявка успешно создана! Менеджер свяжется с вами.
                  </div>
                )}
                
                {isClient && result && (
                  <PDFDownloadLink
                    document={<CalculatorPDF data={result} formData={formData} />}
                    fileName={`tradelab-calc-${formData.dest_country}-${new Date().getTime()}.pdf`}
                  >
                    {({ loading }) => (
                      <button 
                        disabled={loading}
                        className="w-full sm:w-auto px-6 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm font-medium disabled:opacity-50"
                      >
                        {loading ? 'Подготовка...' : 'Скачать PDF'}
                      </button>
                    )}
                  </PDFDownloadLink>
                )}

                <button 
                  onClick={handleCreateOrder}
                  disabled={orderInProgress || orderSuccess}
                  className="w-full sm:w-auto px-6 py-2 rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500 transition-all text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {orderInProgress ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PackageCheck className="w-4 h-4" />
                  )}
                  {orderSuccess ? 'Заявка отправлена' : 'Создать заказ'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
