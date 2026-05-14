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
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from 'next/dynamic';
import {
  calculateLandedCost,
  lookupHSCode,
  type DealPassport,
  type CalculationPackage as CalcResult,
  type HSCodeLookupResult
} from "@/lib/api/calc";
import { SUPPORTED_COUNTRIES } from "@/lib/constants/countries";
import { CalculatorPDF } from "@/components/pdf/CalculatorPDF";
import { getRequirements } from "@/lib/calc/requirements";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  { ssr: false }
);

function LogisticsCalculatorContent() {
  const searchParams = useSearchParams();

  const [formData, setFormData] = useState<DealPassport>({
    dest_country: 'KZ',
    incoterms: 'CIF',
    goods_value: 1000,
    currency: 'USD',
    weight_gross_kg: 50,
    hs_code: '',
    // Optional/New Fields initialized
    origin_country: undefined,
    mode_preference: undefined,
    invoice_includes_freight: false,
  });

  const [result, setResult] = useState<CalcResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hsCode = searchParams.get('hs_code');
    if (hsCode) {
      setFormData(prev => ({ ...prev, hs_code: hsCode }));
    }
  }, [searchParams]);

  // HS Lookup State
  const [hsInfo, setHsInfo] = useState<HSCodeLookupResult | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);

  // HS Lookup Effect
  useEffect(() => {
    const rawCode = formData.hs_code || '';
    const cleanCode = rawCode.replace(/\D/g, '').slice(0, 10);
    
    // Threshold: 6 digits
    if (cleanCode.length < 6) {
        setHsInfo(null);
        setIsLookupLoading(false);
        return;
    }

    const controller = new AbortController();
    
    // Debounce 500ms
    const timeoutId = setTimeout(async () => {
        setIsLookupLoading(true);
        try {
            const data = await lookupHSCode(cleanCode, controller.signal);
            if (!controller.signal.aborted) {
                setHsInfo(data);
            }
        } catch (e) {
            // ignore aborts or network errors
        } finally {
            if (!controller.signal.aborted) setIsLookupLoading(false);
        }
    }, 500);

    return () => {
        clearTimeout(timeoutId);
        controller.abort();
    };
  }, [formData.hs_code]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'goods_value' || name === 'weight_gross_kg' ? (value === '' ? 0 : parseFloat(value) || 0) : value
    }));
  };

  // Requirements Calculation
  const requirements = getRequirements(formData.incoterms, { 
      invoice_includes_freight: formData.invoice_includes_freight 
  });

  const missingFields = requirements.requiredFields.filter(f => {
      const val = formData[f as keyof DealPassport];
      if (typeof val === 'boolean') return false; // boolean is always present
      if (typeof val === 'number') return isNaN(val) || val <= 0;
      return !val || (val as string).trim() === '';
  });

  const isBlocked = missingFields.length > 0;

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
      // Clean payload: remove undefined/null/empty strings
      const payload = Object.entries(formData).reduce((acc, [key, val]) => {
          if (val !== undefined && val !== null && val !== '') {
              // @ts-ignore
              acc[key] = val;
          }
          return acc;
      }, {} as DealPassport);
      
      const data = await calculateLandedCost(payload);

      if (data.status === 'incomplete') {
        const missing = data.all_missing_inputs.length > 0 
           ? data.all_missing_inputs.join(', ') 
           : "Не удалось рассчитать итоговую сумму (возможно, нет маршрута)";
        setError(`Расчёт неполон: ${missing}`);
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
                
                {/* HS Code Hint */}
                {(hsInfo || isLookupLoading) && (
                  <div className="mt-2 text-xs px-1 animate-in fade-in slide-in-from-top-1">
                      {isLookupLoading ? (
                         <span className="text-white/40 animate-pulse">Поиск кода...</span>
                      ) : hsInfo?.found === false ? (
                         <span className="text-white/30">Описание не найдено (будет использован общий тариф)</span>
                      ) : hsInfo?.exact ? (
                         <div className="text-emerald-400">
                            <span className="font-bold">✓ {hsInfo.exact.code}:</span> {hsInfo.exact.clean_name}
                         </div>
                      ) : (hsInfo?.matches && hsInfo.matches.length > 0) ? (
                         <div className="text-yellow-400/80">
                            <span className="font-bold">Похоже на (префикс {(formData.hs_code || '').replace(/\D/g, '').slice(0, 6)}...):</span> {hsInfo.matches[0].clean_name.slice(0, 80)}...
                         </div>
                      ) : null}
                  </div>
                )}
              </div>

                {/* DDP Warning */}
               {requirements.isEscalation && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-yellow-200">Требуется ручная проверка</p>
                      <p className="text-xs text-yellow-200/60">
                         Расчёт DDP требует подтверждения ставок и пошлин менеджером. 
                         Вы можете отправить заявку для детального расчёта.
                      </p>
                    </div>
                  </div>
                )}

               {/* Logistics Section (Conditional) */}
               {requirements.visibleFields.includes('origin_country') && (
                  <div className="space-y-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2">
                     <h4 className="text-sm font-bold text-emerald-400 uppercase flex items-center gap-2">
                        <Truck className="w-3 h-3" /> Логистика
                     </h4>
                     
                     <div>
                        <label className="block text-xs font-bold text-white/50 uppercase mb-2 ml-1">Страна отправления</label>
                         <select 
                            name="origin_country"
                            value={formData.origin_country || ''}
                            onChange={handleInputChange}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-emerald-500/50 focus:outline-hidden"
                         >
                            <option value="">Не выбрано</option>
                            <option value="CN">Китай (CN)</option>
                            <option value="TR">Турция (TR)</option>
                            <option value="DE">Германия (DE)</option>
                            <option value="KR">Корея (KR)</option>
                            {/* Add more as needed */}
                         </select>
                     </div>
                     {!formData.origin_country && (
                        <div className="mt-2 flex items-start gap-2 text-yellow-500/80 text-xs px-1">
                           <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                           <span>Пожалуйста, выберите страну отправления. Иначе расчёт будет выполнен для Китая (CN) по умолчанию.</span>
                        </div>
                     )}

                     {requirements.visibleFields.includes('mode_preference') && (
                         <div>
                            <label className="block text-xs font-bold text-white/50 uppercase mb-2 ml-1">Вид транспорта</label>
                             <select 
                                name="mode_preference"
                                value={formData.mode_preference || ''}
                                onChange={handleInputChange}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-emerald-500/50 focus:outline-hidden"
                             >
                                <option value="">Авто-выбор</option>
                                <option value="road">Авто (Фура)</option>
                                <option value="rail">Ж/Д</option>
                                <option value="air">Авиа</option>
                                <option value="sea">Море</option>
                             </select>
                         </div>
                     )}
                  </div>
               )}

               {/* DAP Specific: Invoice Includes Freight */}
               {formData.incoterms === 'DAP' && (
                   <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                      <input 
                        type="checkbox"
                        id="invoice_includes_freight"
                        name="invoice_includes_freight"
                        checked={formData.invoice_includes_freight || false}
                        onChange={(e) => setFormData(p => ({ ...p, invoice_includes_freight: e.target.checked }))}
                        className="w-5 h-5 rounded border-white/20 bg-white/10 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                      />
                      <label htmlFor="invoice_includes_freight" className="text-sm text-white/80 cursor-pointer">
                          В инвойс включена доставка?
                          <span className="block text-xs text-white/40">Если да, мы не будем считать фрахт</span>
                      </label>
                   </div>
               )}

              <div className="space-y-2">
                  <button 
                    onClick={handleCalculate}
                    disabled={isLoading || isBlocked}
                    className="w-full bg-linear-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        {requirements.isEscalation ? "Запросить расчёт" : "Рассчитать Landed Cost"}
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                  
                  {isBlocked && (
                    <div className="text-center">
                        <span className="text-xs text-red-400/80">
                           Заполните обязательные поля: {missingFields.join(', ')}
                        </span>
                    </div>
                  )}
              </div>
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
                  
          
                  {requirements.isEscalation ? (
                      <div className="text-3xl font-bold text-white mb-4">
                         ----
                      </div>
                  ) : result.totals.landed_cost_range_usd ? (
                      <div className="text-5xl font-bold text-white mb-4">
                        ${result.totals.landed_cost_range_usd[0].toLocaleString()} – ${result.totals.landed_cost_range_usd[1].toLocaleString()}
                      </div>
                  ) : (
                      <div className="text-3xl font-bold text-white/50 mb-4">
                         —
                      </div>
                  )}
                  
                  <p className="text-white/60 text-sm max-w-md">
                    {requirements.isEscalation 
                        ? "Для условий DDP требуется уточнение ставок и пошлин брокером." 
                        : `Расчётная стоимость товара с учётом доставки до склада в ${formData.dest_country} и всех таможенных платежей.`}
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
                      <span className="text-white font-mono font-bold">
                        {requirements.isEscalation 
                          ? "--" 
                          : `$${result.duty_vat.duty.range_usd[0].toFixed(2)} – ${result.duty_vat.duty.range_usd[1].toFixed(2)}`
                        }
                      </span>
                    </div>
                    <div className="flex justify-between items-end border-b border-white/5 pb-2">
                      <span className="text-white/60 text-sm">НДС ({(result.duty_vat.vat.rate * 100).toFixed(0)}%):</span>
                      <span className="text-white font-mono font-bold">
                        {requirements.isEscalation 
                          ? "--" 
                          : `$${result.duty_vat.vat.range_usd[0].toFixed(2)} – ${result.duty_vat.vat.range_usd[1].toFixed(2)}`
                        }
                      </span>
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
                          <div className="text-[11px] text-white/40">{s.transit_days_range.min}-{s.transit_days_range.max} дн.</div>
                        </div>
                        <div className="font-mono font-bold text-white">
                          ${s.cost_usd_range.min.toFixed(0)}-${s.cost_usd_range.max.toFixed(0)}
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

export default function LogisticsCalculatorPage() {
  return (
    <Suspense fallback={null}>
      <LogisticsCalculatorContent />
    </Suspense>
  );
}
