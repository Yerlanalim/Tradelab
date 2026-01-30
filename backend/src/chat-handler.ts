import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { P3_BASE_MODEL, P3_SEARCH_MODEL } from './config.js';
import { TC_PRICING, USD_PRICING } from './pricing.js';

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
  "Бюджет/цена за штуку: ...\n" +
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
       return p.includes("product-detail") || p.includes("/product/") || p.includes("/p-") || p.includes("/showroom/");
    }
    // For Made-in-China - any product related path
    if (h.includes("made-in-china.com")) {
       return p.includes("/product/") || p.includes("product-detail") || p.includes("/showroom/");
    }
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

const runHarvesterAgent = async (runOpenAI: any, query: string): Promise<CsvItem[]> => {
  trace("Harvester", `Streaming Search for: ${query}`);
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
      // Only log full new links
      for (let i = currentLinks.length; i < fresh.length; i++) {
        const link = fresh[i];
        // Ensure link doesn't look like a stub (e.g. just "https://www.alibaba.com/product-detail")
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
    
    // DEBUG: see what the model actually says
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

const runAnalystAgent = async (runOpenAI: any, candidates: CsvItem[], query: string, mode: "preview" | "full"): Promise<any> => {
  if (!candidates.length) return null;
  const subset = candidates.slice(0, mode === "preview" ? 20 : 40);
  const dataBlock = subset.map(i => `URL: ${i.link}`).join("\n");
  const prompt = `Procurement Analyst. Target: "${query}".
  Mode: ${mode === "preview" ? "Preview (Quick scan)" : "FULL REPORT (Detailed analysis)"}.
  
  Candidates:
  ${dataBlock}
  
  Identify TOP 10 BEST items. ${mode === 'full' ? 'Provide deep risk assessment.' : ''}
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
    const data = await runOpenAI({
      model: P3_BASE_MODEL,
      input: prompt,
      response_format: { type: "json_object" }
    });
    const candidateJson = extractJsonCandidate(getResponseText(data));
    return candidateJson ? JSON.parse(candidateJson) : null;
  } catch (e) {
    console.error("Analyst failed", e);
    return null;
  }
};

// --- HANDLER ---

export async function chatHandler(
  payload: ChatRequest, 
  authHeader: string, 
  supabaseAdmin: SupabaseClient, 
  runOpenAI: any,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<ChatHandlerResult> {
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
        const balance = Array.isArray(bal) ? bal[0]?.balance_total : (bal?.balance_total ?? (typeof bal === 'number' ? bal : 0));
        console.log(`[TC CHECK] User: ${user.id}, Balance: ${balance}, Required: ${P3_RFQ_TC}`);
        
        if (balance < P3_RFQ_TC) return { status: 200, body: { ok: true, message: "Недостаточно TC", ui_hints: { show_paywall: true } } };
        await supabaseAdmin.rpc("tc_apply_debit", { p_user_id: user.id, p_amount: P3_RFQ_TC, p_reason: "P3 RFQ Generation", p_ref_id: session_id });
        const res = await runOpenAI({ model: P3_BASE_MODEL, input: `Напиши профессиональный RFQ (Request for Quotation) для поставщиков по следующему запросу: ${query}. Использовать русский язык.` });
        return { status: 200, body: { ok: true, message: getResponseText(res) } };
      }

      if (confirmId === "p3_full_analysis" || confirmId === "p3_full_v1") {
        const { data: bal, error: balErr } = await supabaseAdmin.rpc("tc_get_balance", { p_user_id: user.id });
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
           const raw = await runHarvesterAgent(runOpenAI, query);
           targetLinks = runScreenerAgent(raw);
        }

        const { data: order } = await supabaseAdmin.from("orders").insert({ 
          user_id: user.id, product_type: "p3", status: "processing", 
          price: P3_FULL_USD, idempotency_key: buildIdempotencyKey(query, session_id + ":full") 
        }).select("id").single();
        if (!order) return { status: 500, body: { ok: false, message: "Ошибка создания заказа" } };
        
        await supabaseAdmin.rpc("tc_apply_debit", { p_user_id: user.id, p_amount: P3_FULL_TC, p_ref_id: order.id, p_reason: "P3 Full Supplier Report" });
        
        const analyzed = await runAnalystAgent(runOpenAI, targetLinks, query, "full");
        
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
      const rawLinks = await runHarvesterAgent(runOpenAI, query);
      const uniqueLinks = runScreenerAgent(rawLinks);
      
      const { data: sSearch } = await supabaseAdmin.from("supplier_searches").insert({ 
        user_id: user.id, session_id, query, status: "preview",
        search_meta: { total_links_found: uniqueLinks.length, raw_links: uniqueLinks.map(l => l.link) }
      }).select("id").single();

      const analyzed = await runAnalystAgent(runOpenAI, uniqueLinks, query, "preview");
      
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
          requires_confirm: true, 
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
  }
}
