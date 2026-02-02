import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { P3_BASE_MODEL, P3_SEARCH_MODEL, GEMINI_2_5_PRO_PRICING, GEMINI_2_5_FLASH_PRICING } from './config.js';
import { TC_PRICING, USD_PRICING } from './pricing.js';
import { calculateCost } from './openai.js';

// --- TYPES ---

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatRequest = {
  messages?: ChatMessage[];
  page_context?: string;
  session_id?: string;
  context?: unknown;
};

export type ChatHandlerResult = {
  status: number;
  body: Record<string, unknown>;
};

export type SupplierSearchItem = {
  name: string;
  platform: string;
  price_range?: string;
  moq?: string;
  location?: string;
  link?: string;
  img_url?: string;
  risk_level?: 'low' | 'medium' | 'high';
  risk_factors?: string[];
  supplier_type?: string;
  verification_badges?: string[];
};

export type CsvItem = {
  name: string;
  link: string;
  platform: string;
};

// --- CONSTANTS ---

const P3_FULL_TC = TC_PRICING.p3FullAnalysis;
const P3_FULL_USD = USD_PRICING.p3FullAnalysis;
const P3_RFQ_TC = TC_PRICING.p3Rfq;

const SUPPLIER_INTAKE_TEMPLATE =
  "Товар: ...\n" +
  "Материалы/спецификации: ...\n" +
  "MOQ: ...\n" +
  "Бюджет/цена за штуку: ... (в USD)\n" +
  "Регион/город в Китае: ...\n" +
  "Сроки поставки: ...";

// --- UTILITIES ---

const trace = (stage: string, data: unknown) => {
  const now = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  console.log(`\n[${now}] 🔹 [TRACE: ${stage}]`);
  if (Array.isArray(data)) {
    console.log(`Items count: ${data.length}`);
    if (data.length > 0) console.log('Sample:', JSON.stringify(data[0], null, 2));
  }
  else if (typeof data === "string") console.log(data.slice(0, 500) + (data.length > 500 ? "..." : ""));
  else console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  console.log("--------------------------\n");
};

const normalizeText = (value: string | null | undefined, max = 360) => {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
};

const extractLinks = (text: string): string[] => {
  if (!text) return [];
  const matches = text.match(/https?:\/\/(?:www\.|m\.|[a-z0-9]+\.)?(?:alibaba\.com|made-in-china\.com)\/[^\s)\]>"']+/gi) || [];
  return Array.from(new Set(matches.map(l => l.replace(/[).,;]+$/, "")))).filter(isValidListingLink);
};

const extractJsonCandidate = (raw: string) => {
  if (!raw) return null;
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? raw.trim();
  const jsonStart = candidate.indexOf("{");
  const jsonEnd = candidate.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) return null;
  return candidate.slice(jsonStart, jsonEnd + 1);
};

const getResponseText = (data: any): string => {
  if (!data) return "";
  if (data.error) return `AI Error: ${data.error.message || JSON.stringify(data.error)}`;
  if (typeof data.output_text === 'string') return data.output_text;
  if (Array.isArray(data.output)) {
    const msg = data.output.find((i: any) => i.type === 'message');
    if (msg?.content) {
      const txtBlock = msg.content.find((c: any) => c.text || c.type === 'text');
      if (txtBlock?.text) return txtBlock.text;
    }
  }
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  return typeof data === 'string' ? data : JSON.stringify(data);
};

const isValidListingLink = (link: string) => {
  try {
    const u = new URL(link);
    const h = u.hostname.toLowerCase();
    const p = u.pathname.toLowerCase();
    
    // Ignore obviously bad pages
    if (link.includes("/trade/") || link.includes("login") || link.includes("signin")) return false;
    
    // For Alibaba - any product related path
    if (h.includes("alibaba.com")) {
       const isProduct = p.includes("product-detail") || p.includes("/product/") || p.includes("/p-");
       // Most product IDs are long numeric strings
       const hasId = /\d{10,}/.test(p); 
       return isProduct && hasId;
    }
    // For Made-in-China - any product related path
    if (h.includes("made-in-china.com")) {
       const isProduct = p.includes("/product/") || p.includes("product-detail");
       return isProduct && p.length > 20;
    }
    
    console.log(`[Harvester] Link rejected: ${link} (Path: ${p})`);
    return false;
  } catch { return false; }
};

const buildIdempotencyKey = (q: string, s?: string | null) => `p3:${s ?? "anon"}:${normalizeText(q, 50).replace(/\s+/g, "_")}`;

const formatSupplierPreview = (result: any, items: any[], foundCount: number) => {
  const cards = items.map((item, index) => {
    return `**${index + 1}. ${item.name || 'Товар'}**\n` +
           `💰 Цена: ${item.price_range || 'по запросу'} · 📦 MOQ: ${item.moq || '1 шт'}\n` +
           `🏷️ Площадка: ${item.platform || 'Китай'} · 📍 ${item.location || 'Китай'}\n` +
           `🔗 [Перейти к товару](${item.link})`;
  }).join("\n\n");

  const lines = [
    `🔍 **Поиск завершен.** Найдено более **${foundCount}** предложений.`,
    `Вот preview наиболее релевантных позиций:`,
    "\n" + cards,
    `\n---`,
    `*Всего найдено: ${foundCount} | Ограничение: 180с (streaming mode)*`,
  ].filter(Boolean);
  
  return lines.join("\n\n");
};

const formatSupplierFull = (analyzed: any, items: any[]) => {
  const cards = items.slice(0, 15).map((item, index) => {
    const riskIcon = item.risk_level === "low" ? "🟢" : item.risk_level === "medium" ? "🟡" : "🔴";
    const riskText = item.risk_level === "low" ? "Низкий риск" : item.risk_level === "medium" ? "Средний риск" : "Высокий риск";
    
    return `### ${index + 1}. ${item.name || 'Поставщик'}\n` +
           `**Статус:** ${riskIcon} ${riskText}\n` +
           `💰 **Цена:** ${item.price_range || 'по запросу'} | 📦 **MOQ:** ${item.moq || 'N/A'}\n` +
           `📍 **Локация:** ${item.location || 'Китай'} | 🏷️ **Платформа:** ${item.platform}\n` +
           `⚠️ **Факторы риска:** ${item.risk_factors ? item.risk_factors.join(', ') : 'Не обнаружены'}\n` +
           `🔗 [Посмотреть на сайте](${item.link})\n` +
           `---`;
  }).join("\n\n");

  return `## 📜 Полный отчет по поиску поставщиков\n\n` + 
         `> **Запрос:** ${analyzed.summary || 'Анализ завершен'}\n\n` +
         cards + 
         `\n\n**Итоговая рекомендация:** Исходя из анализа ${items.length} источников, мы рекомендуем обратить внимание на ТОП-3 поставщиков с зеленым маркером.`;
};

// --- AGENTS ---

const runHarvesterAgent = async (runOpenAI: any, runGeminiSearch: any, runSerperSearch: any, query: string, googleConfig: GoogleConfig): Promise<CsvItem[]> => {
  trace("Harvester", `Streaming Search for: ${query}`);
  
  // 1. Priority: Serper Search
  if (googleConfig.hasSerper) {
    console.log('[Harvester] Using Serper Search');
    try {
      // Clean query
      let cleanQuery = query;
      const productMatch = query.match(/Товар:\s*(.*?)(?:\s*Материалы\/спецификации:|$)/i);
      if (productMatch && productMatch[1]) {
        cleanQuery = productMatch[1].trim();
      } else {
        cleanQuery = query.replace(/^Товар:\s*/i, '').split(/[МM]OQ|Бюджет|Сроки/)[0].trim().slice(0, 100);
      }
      
      const items = await runSerperSearch(cleanQuery);
      
      if (items && Array.isArray(items) && items.length > 0) {
        trace("Harvester Final (Serper)", items.length);
        return items;
      }
      console.log('[Harvester] Serper returned 0 product links, checking fallback options...');
    } catch (error) {
      console.error('[Harvester] Serper Search failed:', error);
    }
  }

  // 2. Fallback: Google Gemini Search Grounding
  if (!googleConfig.hasOpenAI && googleConfig.hasGemini) {
    console.log('[Harvester] Using Gemini Google Search Grounding');
    try {
      // Более надежная очистка: ищем текст между Товар: и следующим полем
      let cleanQuery = query;
      const productMatch = query.match(/Товар:\s*(.*?)(?:\s*Материалы\/спецификации:|$)/i);
      if (productMatch && productMatch[1]) {
        cleanQuery = productMatch[1].trim();
      } else {
        // Fallback: просто убираем префикс и берем первые 60 символов
        cleanQuery = query.replace(/^Товар:\s*/i, '').split(/[МM]OQ|Бюджет|Сроки/)[0].trim().slice(0, 100);
      }
      
      const res = await runGeminiSearch(`${cleanQuery} product listing alibaba`);
      const content = getResponseText(res);
      const links = extractLinks(content);
      
      const items = links.map(link => ({
        name: "Product Item",
        link: link,
        platform: link.includes("alibaba") ? "Alibaba" : "Made-in-China"
      }));
      
      trace("Harvester Final (Gemini)", items.length);
      return items;
    } catch (error) {
      console.error('[Harvester] Gemini Search failed:', error);
      return [];
    }
  }
  
  // OpenAI Search (Original logic)
  
  // OpenAI Search
  const prompt = 
    `Find direct product listing URLs for "${query}" on Alibaba.com and Made-in-China.com. ` +
    `I need at least 20 specific product links. ` +
    `Output format: Just a plain text list of URLs. ` +
    `Do not generate placeholder links like "123456.html". Use the tool to find REAL links.`;

  const payload = {
    model: P3_SEARCH_MODEL, 
    input: [
       { role: "system", content: "You are a sourcing assistant with access to real-time web search." },
       { role: "user", content: prompt }
    ],
    tools: [{ type: "web_search_preview" }] 
  };
  
  let currentLinks: string[] = [];
  
  const onPartial = (text: string) => {
    const fresh = extractLinks(text);
    if (fresh.length > currentLinks.length) {
      for (let i = currentLinks.length; i < fresh.length; i++) {
        const link = fresh[i];
        if (link.length > 40) {
          const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
          console.log(`[${time} STREAM] Found link #${i + 1}: ${link}`);
        }
      }
      currentLinks = fresh;
    }
  };

  try {
    const data = await runOpenAI(payload, onPartial);
    const content = getResponseText(data);
    
    if (content.length > 0) {
      console.log(`[Harvester] Raw output length: ${content.length}`);
      if (extractLinks(content).length === 0) {
        console.log(`[Harvester] Sample content: ${content.slice(0, 300)}...`);
      }
    }

    const links = extractLinks(content);
    
    if (links.length === 0 && content.length === 0) {
      console.warn("[Harvester] Model returned NOTHING. Check stream health.");
    }

    const items = links.map(link => ({
      name: "Product Item",
      link: link,
      platform: link.includes("alibaba") ? "Alibaba" : "Made-in-China"
    }));
    
    trace("Harvester Final", items.length);
    return items;
  } catch (e) {
    console.error("Harvester failed but checking partials...", e);
    return currentLinks.map(link => ({
      name: "Product Item", link, platform: link.includes("alibaba") ? "Alibaba" : "Made-in-China"
    }));
  }
};

const runScreenerAgent = (items: CsvItem[]): CsvItem[] => {
  trace("Screener", `Cleaning ${items.length} items...`);
  const map = new Map();
  items.forEach(i => {
    const clean = i.link.toLowerCase().split('?')[0];
    if (!map.has(clean)) map.set(clean, i);
  });
  const result = Array.from(map.values());
  trace("Screener Output", result.length);
  return result;
};

const runAnalystAgent = async (runOpenAI: any, runGemini: any, candidates: CsvItem[], query: string, mode: "preview" | "full", googleConfig: GoogleConfig): Promise<any> => {
  if (!candidates.length) return null;
  const subset = candidates.slice(0, mode === "preview" ? 20 : 40);
  const dataBlock = subset.map(i => `URL: ${i.link}`).join("\n");
  const prompt = `Procurement Analyst. Target: "${query}".
  Mode: ${mode === "preview" ? "Preview (Quick scan)" : "FULL REPORT (Detailed analysis)"}.
  
  Candidates:
  ${dataBlock}
  
  Identify TOP 10 BEST items. ${mode === 'full' ? 'Provide deep risk assessment.' : ''}
  IMPORTANT: Each item MUST use the EXACT URL from the Candidates list above. DO NOT invent URLs or use placeholders like "[URL]".
  Format: JSON only.
  {
    "summary": "Russian summary of the market situation",
    "items": [ 
      { 
        "name": "Supplier/Product Name", 
        "link": "URL", 
        "price_range": "e.g. $10-15", 
        "moq": "e.g. 100 pcs", 
        "location": "City/Region", 
        "platform": "Alibaba/MIC", 
        "risk_level": "low/medium/high",
        "risk_factors": ["string array of specific concerns if mode is full"] 
      } 
    ]
  }`;

  try {
    let responseText = '';
    
    // Gemini Fallback
    if (!googleConfig.hasOpenAI && googleConfig.hasGemini) {
      console.log('[Analyst] Using Google Gemini');
      const geminiResponse = await runGemini(prompt, { type: 'json_object' });
      responseText = getResponseText(geminiResponse);
    } else {
      // OpenAI
      const data = await runOpenAI({
        model: P3_BASE_MODEL,
        input: prompt,
        response_format: { type: "json_object" }
      });
      responseText = getResponseText(data);
    }
    
    const candidateJson = extractJsonCandidate(responseText);
    let parsed = candidateJson ? JSON.parse(candidateJson) : null;

    // Link Restoration Logic: Prohibit hallucinations
    if (parsed && parsed.items) {
      console.log(`[Analyst Debug] Validating ${parsed.items.length} items against candidates...`);
      const approvedLinks = new Set(candidates.map(c => c.link));
      
      parsed.items = parsed.items.map((item: any, idx: number) => {
        const originalUrl = item.link;
        // Check if link is known or a hallucination
        if (!approvedLinks.has(item.link)) {
          // Model hallucinated a link. Match by name to original.
          const match = candidates.find(c => 
            (item.name && c.name.toLowerCase().includes(item.name.toLowerCase().slice(0, 15))) ||
            (c.name && item.name.toLowerCase().includes(c.name.toLowerCase().slice(0, 15)))
          );
          
          if (match) {
            item.link = match.link;
            console.log(`  Item ${idx + 1}: Hallucinated link replaced with real URL. (\n    AI: ${originalUrl}\n    Real: ${item.link}\n  )`);
          } else {
            console.warn(`  Item ${idx + 1}: Hallucinated link detected but NO MATCH found for "${item.name}".`);
          }
        }
        return item;
      });
    }

    trace("Analyst Output", JSON.stringify(parsed?.items?.map((p: any) => ({ name: p.name, link: p.link })), null, 2));
    return parsed;
  } catch (e) {
    console.error("Analyst failed", e);
    return null;
  }
};

// --- HANDLER ---

export type GoogleConfig = {
  hasOpenAI: boolean;
  hasSerper: boolean;
  hasGoogleSearch: boolean;
  hasGemini: boolean;
  googleSearchKey?: string;
  googleSearchCx?: string;
  geminiModel?: string;
};

export async function chatHandler(
  payload: ChatRequest, 
  authHeader: string, 
  supabaseAdmin: SupabaseClient, 
  rawRunOpenAI: any,
  rawRunGemini: any,
  rawRunGeminiSearch: any,
  rawRunSerperSearch: any,
  supabaseUrl: string,
  supabaseAnonKey: string,
  googleConfig: GoogleConfig
): Promise<ChatHandlerResult> {
  const calculateGeminiCost = (model: string, usage: any) => {
    if (!usage) return 0;
    
    // Choose pricing based on model name
    const isPro = model.toLowerCase().includes('pro');
    const pricing = isPro ? GEMINI_2_5_PRO_PRICING : GEMINI_2_5_FLASH_PRICING;
    
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || (promptTokens + completionTokens);

    // For Pro, price changes after 200k tokens
    const isLarge = totalTokens > 200000;
    
    let cost = 0;
    if (isPro) {
      const inputRate = isLarge ? GEMINI_2_5_PRO_PRICING.input_large : GEMINI_2_5_PRO_PRICING.input;
      const outputRate = isLarge ? GEMINI_2_5_PRO_PRICING.output_large : GEMINI_2_5_PRO_PRICING.output;
      cost = (promptTokens * inputRate) / 1000000 + (completionTokens * outputRate) / 1000000;
    } else {
      cost = (promptTokens * GEMINI_2_5_FLASH_PRICING.input) / 1000000 + (completionTokens * GEMINI_2_5_FLASH_PRICING.output) / 1000000;
    }
    
    return cost;
  };

  let totalTokens = 0;
  let totalCost = 0;

  const runOpenAI = async (p: any, onPartial?: (c: string) => void) => {
    const res = await rawRunOpenAI(p, onPartial);
    const usage = (res as any).usage;
    if (usage) {
      const tokens = usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
      const cost = calculateCost(p.model || P3_BASE_MODEL, usage);
      totalTokens += tokens;
      totalCost += cost;
    }
    return res;
  };

  const runGemini = async (prompt: string, responseFormat?: { type: string }) => {
    const res = await rawRunGemini(prompt, responseFormat);
    const usage = (res as any).usage;
    if (usage) {
      const tokens = usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
      const cost = calculateGeminiCost(googleConfig.geminiModel || 'gemini-1.5-pro', usage);
      totalTokens += tokens;
      totalCost += cost;
    }
    return res;
  };

  const runGeminiSearch = async (query: string) => {
    const res = await rawRunGeminiSearch(query);
    const usage = (res as any).usage;
    if (usage) {
      const tokens = usage.total_tokens || 0;
      const cost = calculateGeminiCost(googleConfig.geminiModel || 'gemini-1.5-pro', usage);
      totalTokens += tokens;
      totalCost += cost;
    }
    return res;
  };

  const runSerperSearch = async (query: string) => {
    const res = await rawRunSerperSearch(query);
    return res;
  };

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return { status: 401, body: { ok: false, message: 'Unauthorized' }};

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return { status: 401, body: { ok: false, message: 'Unauthorized' }};

  const { messages = [], page_context, session_id, context } = payload;
  const mode = page_context?.includes("search") ? "supplier_search" : "assistant";
  const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? "";
  const flow = (context as any)?.flow_state ?? {};
  const query = (flow.query || lastMsg).trim();

  try {
    if (mode === "supplier_search") {
      const confirmId = (context as any)?.confirm?.action_id || flow.confirmed_action_id;

      if (confirmId === "p3_rfq_v1") {
        const { data: bal, error: balErr } = await supabaseAdmin.rpc("tc_get_balance", { p_user_id: user.id });
        if (balErr) console.error("[TC CHECK ERROR]", balErr);
        console.log(`[TC DEBUG] Raw balance response for ${user.id}:`, JSON.stringify(bal));

        const balance = Array.isArray(bal) ? bal[0]?.balance_total : (bal?.balance_total ?? (typeof bal === 'number' ? bal : 0));
        console.log(`[TC CHECK] User: ${user.id}, Balance: ${balance}, Required: ${P3_RFQ_TC}`);
        
        if (balance < P3_RFQ_TC) return { status: 200, body: { ok: true, message: "Недостаточно TC", ui_hints: { show_paywall: true } } };
        await supabaseAdmin.rpc("tc_apply_debit", { p_user_id: user.id, p_amount: P3_RFQ_TC, p_reason: "P3 RFQ Generation", p_ref_id: session_id });
        const res = await runOpenAI({ model: P3_BASE_MODEL, input: `Напиши профессиональный RFQ (Request for Quotation) для поставщиков по следующему запросу: ${query}. Использовать русский язык.` });
        return { status: 200, body: { ok: true, message: getResponseText(res) } };
      }

      if (confirmId === "p3_full_analysis" || confirmId === "p3_full_v1") {
        const { data: bal, error: balErr } = await supabaseAdmin.rpc("tc_get_balance", { p_user_id: user.id });
        if (balErr) console.error("[TC CHECK ERROR]", balErr);
        console.log(`[TC DEBUG] Raw balance response for ${user.id}:`, JSON.stringify(bal));

        const balance = Array.isArray(bal) ? bal[0]?.balance_total : (bal?.balance_total ?? (typeof bal === 'number' ? bal : 0));
        console.log(`[TC CHECK] User: ${user.id}, Balance: ${balance}, Required: ${P3_FULL_TC}`);

        if (balance < P3_FULL_TC) return { 
          status: 200, 
          body: { 
            ok: true, 
            message: `У вас недостаточно TC на балансе (текущий баланс: ${balance} TC). Для получения полного отчета требуется ${P3_FULL_TC} TC.`, 
            ui_hints: { show_paywall: true } 
          } 
        };
        
        let targetLinks: CsvItem[] = [];
        const existingData = (context as any)?.entity?.entity_value || (context as any)?.data;
        if (existingData?.raw_links) {
          targetLinks = existingData.raw_links.map((l: string) => ({ 
            link: l, platform: l.includes("alibaba") ? "Alibaba" : "Made-in-China", name: "Candidate" 
          }));
        }

        if (targetLinks.length === 0) {
           const raw = await runHarvesterAgent(runOpenAI, runGeminiSearch, runSerperSearch, query, googleConfig);
           targetLinks = runScreenerAgent(raw);
        }

        const idempotencyKey = buildIdempotencyKey(query, session_id + ":full");
        
        // Try to insert first
        let { data: order, error: orderErr } = await supabaseAdmin.from("orders").insert({ 
          user_id: user.id, 
          product_type: "p3", 
          status: "processing", 
          price: P3_FULL_USD,
          currency: "USD",
          idempotency_key: idempotencyKey
        }).select("id").single();

        // If idempotency violation, fetch existing order
        if (orderErr && orderErr.code === '23505') {
          console.log("[Idempotency] Order already exists, fetching existing one...");
          const { data: existing } = await supabaseAdmin.from("orders")
            .select("id")
            .eq("user_id", user.id)
            .eq("idempotency_key", idempotencyKey)
            .single();
          order = existing;
          orderErr = null;
        }

        if (orderErr || !order) {
          console.error("[Order Creation Error]", orderErr);
          return { status: 500, body: { ok: false, message: "Ошибка создания заказа", error: orderErr?.message } };
        }
        
        await supabaseAdmin.rpc("tc_apply_debit", { p_user_id: user.id, p_amount: P3_FULL_TC, p_ref_id: order.id, p_reason: "P3 Full Supplier Report" });
        
        const analyzed = await runAnalystAgent(runOpenAI, runGemini, targetLinks, query, "full", googleConfig);
        
        if (analyzed) {
          await supabaseAdmin.from("reports").insert({ 
            order_id: order.id, user_id: user.id, product_type: "p3", status: "ready", 
            result_summary: analyzed 
          });
          await supabaseAdmin.from("orders").update({ status: "done" }).eq("id", order.id);
          const txt = formatSupplierFull(analyzed, analyzed.items);
          return { status: 200, body: { ok: true, message: txt, response: txt, entities: { 
            query, 
            report_id: order.id, 
            result_scope: "full", 
            result_items: analyzed.items,
            final_count: analyzed.items.length
          } } };
        }
        return { status: 500, body: { ok: false, message: "Ошибка анализа. Пожалуйста, попробуйте позже." } };
      }

      // Preview Flow
      if (!query) return { status: 200, body: { ok: true, message: "Опишите товар.", suggested_chips: [{ id: "t", label: "Шаблон", action: "insert", payload: SUPPLIER_INTAKE_TEMPLATE }] } };
      
      const startTime = Date.now();
      const rawLinks = await runHarvesterAgent(runOpenAI, runGeminiSearch, runSerperSearch, query, googleConfig);
      const uniqueLinks = runScreenerAgent(rawLinks);
      
      const { data: sSearch } = await supabaseAdmin.from("supplier_searches").insert({ 
        user_id: user.id, session_id, query, status: "preview",
        search_meta: { total_links_found: uniqueLinks.length, raw_links: uniqueLinks.map(l => l.link) }
      }).select("id").single();

      const analyzed = await runAnalystAgent(runOpenAI, runGemini, uniqueLinks, query, "preview", googleConfig);
      
      if (!analyzed || !analyzed.items || analyzed.items.length === 0) {
        return { status: 200, body: { ok: true, message: "Не найдено товаров по запросу." } };
      }
      
      const previewText = formatSupplierPreview(analyzed, analyzed.items.slice(0, 5), uniqueLinks.length);
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      trace("Action", `Total Preview Search completed in ${totalTime}s`);

      const message = "Вот preview найденных товаров:\n" + previewText;
      const response = { 
        ok: true, 
        message: message, 
        response: message, 
        ui_hints: { 
          progress_state: "shortlist", 
          // requires_confirm removed to let user see cards first
          confirm_action_id: "p3_full_analysis" 
        },
        suggested_chips: [
          { id: "full_report", label: "Получить полный отчет (500 TC)", action: "confirm", payload: "p3_full_analysis" }
        ],
        entities: { 
          query, 
          search_id: sSearch?.id, 
          result_scope: "preview", 
          result_items: analyzed.items,
          found_count: uniqueLinks.length,
          total_found: uniqueLinks.length,
          preview_count: analyzed.items.length,
          source_counts: { 
            alibaba: uniqueLinks.filter(i => i.platform === "Alibaba").length, 
            mic: uniqueLinks.filter(i => i.platform === "Made-in-China").length 
          },
          raw_links: uniqueLinks.map(l => l.link) // Crucial for Reuse logic
        }
      };
      
      await supabaseAdmin.from("chat_entities").insert({ 
        user_id: user.id, session_id, mode, entity_type: "supplier_list", entity_value: response.entities 
      });

      return { status: 200, body: response };
    }

    const res = await runOpenAI({ model: P3_BASE_MODEL, input: lastMsg });
    return { status: 200, body: { ok: true, message: getResponseText(res) } };

  } catch (err) {
    console.error("Handler Error:", err);
    return { status: 502, body: { ok: false, message: "Internal Error" } };
  } finally {
    if (totalTokens > 0) {
      console.log(`\n[GRAND TOTAL] Tokens: ${totalTokens}, Cost: $${totalCost.toFixed(6)}`);
    }
  }
}
