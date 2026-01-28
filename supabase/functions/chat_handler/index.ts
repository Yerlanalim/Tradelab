import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TC_PRICING, USD_PRICING } from "../_shared/pricing.ts";
import { OPENAI_API_KEY, P3_BASE_MODEL, P3_SEARCH_MODEL } from "./config.ts";
import { createOpenAIClient } from "./openai.ts";

const resolveCorsOrigin = (origin: string | null) => {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowed.length === 0) return "*";
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0] ?? "*";
};

const buildCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": resolveCorsOrigin(origin),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
});

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

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatRequest = {
  messages?: ChatMessage[];
  page_context?: string;
  session_id?: string;
  context?: unknown;
};

type SuggestedChip = {
  id: string;
  label: string;
  action: "redirect" | "insert" | "confirm";
  payload: string;
};

type UiHints = {
  redirect_to?: string;
  show_paywall?: boolean;
  progress_state?: string;
  requires_confirm?: boolean;
  confirm_action_id?: string;
};

type SupplierSearchItem = {
  name: string;
  platform: string;
  price_range?: string;
  moq?: string;
  location?: string;
  link?: string;
  img_url?: string;
  model?: string;
  brand?: string;
  supplier_type?: string;
  years_on_platform?: string;
  verification_badges?: string[];
  risk_level?: "low" | "medium" | "high";
  risk_factors?: string[];
};

type SupplierSearchResult = {
  summary: string;
  bench?: {
    price_range?: string;
    moq_range?: string;
  };
  items: SupplierSearchItem[];
  limitations?: string;
};

type SearchNormalization = {
  query_en: string;
  query_zh: string;
  must_have: string[];
  material_terms: string[];
  product_terms: string[];
};

type ToolCall = {
  name: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
};
// --- TYPES FOR OPENAI RESPONSE ---
const trace = (stage: string, data: unknown) => {
  console.log(`\n🔹 [STEP: ${stage}]`);
  if (Array.isArray(data)) console.log(`Items count: ${data.length}`);
  else if (typeof data === "string") console.log(data.slice(0, 500) + (data.length > 500 ? "..." : ""));
  else console.log(JSON.stringify(data, null, 2));
  console.log("--------------------------\n");
};

type ResponseContentItem = {
  type?: string;
  text?: string;
};

type ResponseOutputItem = {
  type?: string;
  content?: ResponseContentItem[];
};

type ChatChoice = {
  message?: {
    content?: string;
  };
};

type OpenAIError = {
  message?: string;
  code?: string;
};

type OpenAIResponseData = {
  output?: ResponseOutputItem[];
  output_text?: string;
  choices?: ChatChoice[];
  error?: OpenAIError;
};

const normalizeText = (value: string | null | undefined, max = 360) => {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
};

const buildIdempotencyKey = (query: string, sessionId?: string | null, searchId?: string | null) => {
  if (searchId) return `p3:${searchId}`;
  if (sessionId) return `p3:${sessionId}`;
  const safeQuery = normalizeText(query, 120).replace(/\s+/g, "_");
  return `p3:${safeQuery || "unknown"}`;
};

const getResponseText = (data: Record<string, unknown> | null): string => {
  if (!data) return "";
  
  const response = data as OpenAIResponseData;

  if (response.error) {
      console.error("OpenAI API Returned Error:", response.error);
      return `Ошибка API: ${response.error.message || JSON.stringify(response.error)}`;
  }

  if (Array.isArray(response.output)) {
    const messageItem = response.output.find((item) => item.type === 'message');
    
    if (messageItem?.content && Array.isArray(messageItem.content)) {
       const textBlock = messageItem.content.find(
         (c) => c.type === 'output_text' || c.type === 'text' || (c.text && typeof c.text === 'string')
       );
       if (textBlock?.text) return textBlock.text;
    }
  }
  
  if (typeof response.output_text === 'string') {
    return response.output_text;
  }

  if (Array.isArray(response.choices) && response.choices.length > 0) {
    return response.choices[0]?.message?.content || "";
  }

  return JSON.stringify(data);
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

const normalizeCompanyName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\W_]+/g, " ")
    .replace(
      /\b(co|ltd|limited|company|inc|corp|group|trading|trade|industrial|industry|manufacturing|factory|technology|tech|machinery|electronics|electric|equipment)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

const parseNumericRange = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "string" || typeof value === "number" ? String(value) : "";
  if (!raw) return null;
  const matches = raw.match(/(\d{1,3}(?:[,\s]\d{3})*|\d+)(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const numbers = matches
    .map((item) => Number(item.replace(/[,\s]/g, "")))
    .filter((num) => Number.isFinite(num));
  if (!numbers.length) return null;
  if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
};

const parseBudgetFromQuery = (query: string) => {
  const normalized = query.toLowerCase();
  const range = parseNumericRange(normalized);
  if (!range) return null;
  if (normalized.includes("цена") || normalized.includes("budget") || normalized.includes("долл")) {
    return range;
  }
  return null;
};

const parseMoqFromQuery = (query: string) => {
  const normalized = query.toLowerCase();
  if (!normalized.includes("moq") && !normalized.includes("штук") && !normalized.includes("шт")) {
    return null;
  }
  return parseNumericRange(normalized);
};

const normalizeSearchQuery = async (
  runOpenAI: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>,
  query: string
) => {
  const payload = {
    model: P3_SEARCH_MODEL,
    input: [
      {
        role: "system",
        content:
          "Нормализуй запрос для поиска поставщиков. Переведи на профессиональные термины " +
          "на EN и ZH. Верни JSON: " +
          "query_en, query_zh, must_have[], material_terms[], product_terms[]. " +
          "must_have — ключевые требования (материал, тип товара, назначение). " +
          "product_terms — основные слова товара. " +
          "material_terms — только материалы. Без лишнего текста.",
      },
      { role: "user", content: query },
    ]
  };
  try {
    const data = await runOpenAI(payload);
    const text = getResponseText(data as Record<string, unknown> | null);
    const candidate = extractJsonCandidate(text);
    if (!candidate) return null;
    const parsed = JSON.parse(candidate) as SearchNormalization;
    if (!parsed?.query_en && !parsed?.query_zh) return null;
    return {
      query_en: parsed.query_en ?? query,
      query_zh: parsed.query_zh ?? "",
      must_have: Array.isArray(parsed.must_have) ? parsed.must_have.filter(Boolean) : [],
      material_terms: Array.isArray(parsed.material_terms)
        ? parsed.material_terms.filter(Boolean)
        : [],
      product_terms: Array.isArray(parsed.product_terms)
        ? parsed.product_terms.filter(Boolean)
        : [],
    };
  } catch {
    return null;
  }
};

const buildSearchQueries = (
  normalized: SearchNormalization | null,
  sourceFocus: "both" | "alibaba" | "made-in-china"
) => {
  const baseEn = normalized?.query_en?.trim() || "";
  const baseZh = normalized?.query_zh?.trim() || "";
  const mustHave = normalized?.must_have?.join(" ").trim() || "";
  
  const queries: string[] = [];

  // Helper function
  const addQuery = (site: string, text: string, type: "product" | "factory" | "showroom") => {
    const siteOp = `site:${site}`;
    const terms = mustHave ? `${text} ${mustHave}` : text;
    
    if (type === "product") {
       // Alibaba specific URL patterns
       if (site.includes("alibaba")) {
           queries.push(`${siteOp} ${terms} "product-detail"`);
       } else {
           // MIC specific URL patterns
           queries.push(`${siteOp} ${terms} "product-detail"`);
       }
    }
    if (type === "factory") queries.push(`${siteOp} ${terms} factory`);
    // Add showroom for MIC as they often list products there
    if (type === "showroom" && site.includes("made-in-china")) {
        queries.push(`${siteOp} ${terms} showroom`);
    }
  };

  if (sourceFocus === "alibaba" || sourceFocus === "both") {
    if (baseEn) {
      addQuery("alibaba.com", baseEn, "product");
      addQuery("alibaba.com", baseEn, "factory");
    }
  }
  
  if (sourceFocus === "made-in-china" || sourceFocus === "both") {
    // MIC often works better with Chinese queries or very simple English ones
    if (baseZh) addQuery("made-in-china.com", baseZh, "product");
    if (baseEn) {
        addQuery("made-in-china.com", baseEn, "product");
        addQuery("made-in-china.com", baseEn, "showroom"); // Added showroom for MIC
    }
  }

  // INCREASE LIMIT: Allow up to 6 queries to cover both platforms adequately
  const finalQueries = Array.from(new Set(queries)).slice(0, 6);
  trace("GENERATED QUERIES", finalQueries);
  return finalQueries;
};


const getPlatformPriority = (platform: string | undefined | null) => {
  const value = platform?.toLowerCase() ?? "";
  if (value.includes("alibaba")) return 2;
  if (value.includes("made-in-china")) return 1;
  return 0;
};

const isPreferredHost = (link?: string | null) => {
  if (!link) return false;
  try {
    const host = new URL(link).hostname.toLowerCase();
    if (host.startsWith("russian.") || host.startsWith("ru.")) return false;
    return (
      host === "www.alibaba.com" ||
      host === "m.alibaba.com" ||
      host === "www.made-in-china.com"
    );
  } catch {
    return false;
  }
};

const inferPlatformFromLink = (link?: string | null) => {
  if (!link) return null;
  try {
    const host = new URL(link).hostname.toLowerCase();
    if (host.includes("alibaba.com")) return "Alibaba";
    if (host.includes("made-in-china.com")) return "Made-in-China";
  } catch {
    return null;
  }
  return null;
};

const isPlaceholderName = (value?: string | null) => {
  const normalized = (value ?? "").trim();
  if (!normalized) return true;
  return (
    /^поставщик\s*\d+$/i.test(normalized) ||
    /^supplier\s*\d+$/i.test(normalized) ||
    /^vendor\s*\d+$/i.test(normalized)
  );
};

const isValidSupplierName = (name?: string | null) =>
  Boolean(name && name.trim().length > 2 && !isPlaceholderName(name));

const isValidListingLink = (link?: string | null) => {
  if (!link) { trace("LINK REJECTED: Empty", "null"); return false; }
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const full = url.toString().toLowerCase();

    if (host.startsWith("russian.") || host.startsWith("ru.")) {
      trace("LINK REJECTED: Russian subdomain", full);
      return false;
    }
    const blocked = [
      "/search",
      "/login",
      "/signin",
      "/account",
      "/blog",
      "/news",
      "/article",
      "/insight",
      "/trend",
      "/press",
      "/product_group",
      "/company_profile",
      "supplier.html",
      "company.html",
    ];
    if (blocked.some((token) => full.includes(token))) {
      trace("LINK REJECTED: Blocklist match", full);
      return false;
    }
    if (full.includes("scene=invalid_items")) {
      trace("LINK REJECTED: Invalid items scene", full);
      return false;
    }

    if (host.endsWith("alibaba.com")) {
      const isValid = (
        path.includes("/product-detail") ||
        path.includes("/showroom") ||
        path.includes("/product/") ||
        path.includes("/p-")
      );
      if (!isValid) trace("LINK REJECTED: Alibaba pattern mismatch", path);
      return isValid;
    }

    if (host.endsWith("made-in-china.com")) {
      const isValid = (
        path.includes("/product-detail") ||
        path.includes("/showroom") ||
        path.includes("/product/") ||
        path.includes("/china-products/") ||
        path.includes("/video-channel/") ||
        path.includes("/amp/")
      );
      if (!isValid) trace("LINK REJECTED: MIC pattern mismatch", path);
      return isValid;
    }

    trace("LINK REJECTED: Unknown Domain/Pattern", full);
    return false;
  } catch {
    trace("LINK REJECTED: URL Parse Error", String(link));
    return false;
  }
};

const isLikelyListingLink = (link?: string | null) => isValidListingLink(link);

// const P3_LINK_VERIFY_LIMIT = 6;
// const P3_LINK_VERIFY_TIMEOUT_MS = 5000;

// const verifyListingLink = async (link: string) => {
//   const controller = new AbortController();
//   const timeoutId = setTimeout(() => controller.abort(), P3_LINK_VERIFY_TIMEOUT_MS);
//   try {
//     const response = await fetch(link, {
//       method: "GET",
//       signal: controller.signal,
//       headers: { "User-Agent": "TradeLabBot/1.0" },
//     });
//     if (!response.ok) return false;
//     const contentType = response.headers.get("content-type") ?? "";
//     if (!contentType.includes("text/html")) return false;
//     const text = (await response.text()).slice(0, 4000).toLowerCase();
//     return text.includes("<html") || text.includes("<!doctype");
//   } catch {
//     return false;
//   } finally {
//     clearTimeout(timeoutId);
//   }
// };

// const verifyListingLinks = async (items: SupplierSearchItem[]) => {
//   const candidates = items.filter((item) => isLikelyListingLink(item.link));
//   const toCheck = candidates.slice(0, P3_LINK_VERIFY_LIMIT);
//   if (!toCheck.length) return items;
//   const checkedLinks = new Set<string>();
//   const verifiedLinks = new Set<string>();
//   await Promise.all(
//     toCheck.map(async (item) => {
//       if (!item.link) return;
//       checkedLinks.add(item.link);
//       const ok = await verifyListingLink(item.link);
//       if (ok) verifiedLinks.add(item.link);
//     })
//   );
//   return items.filter((item) => {
//     if (!item.link) return true;
//     if (!checkedLinks.has(item.link)) return true;
//     return verifiedLinks.has(item.link);
//   });
// };

const isPreferredSource = (item: SupplierSearchItem) => {
  if (isPreferredHost(item.link)) return true;
  const platform = item.platform?.toLowerCase() ?? "";
  return platform.includes("alibaba") || platform.includes("made-in-china");
};

const buildQualityMetrics = (items: SupplierSearchItem[]) => {
  const totalItems = items.length;
  const validLinks = items.filter((item) => isLikelyListingLink(item.link)).length;
  const missingPrice = items.filter((item) => !item.price_range).length;
  const missingMoq = items.filter((item) => !item.moq).length;
  const missingLocation = items.filter((item) => !item.location).length;
  const missingModel = items.filter((item) => !item.model).length;
  const missingSupplierType = items.filter((item) => !item.supplier_type).length;
  return {
    total_items: totalItems,
    valid_links: validLinks,
    missing_price: missingPrice,
    missing_moq: missingMoq,
    missing_location: missingLocation,
    missing_model: missingModel,
    missing_supplier_type: missingSupplierType,
  };
};

const normalizeTerms = (terms: string[]) =>
  terms
    .map((term) => term.toLowerCase().trim())
    .filter((term) => term.length > 2);

const matchesTerms = (item: SupplierSearchItem, terms: string[]) => {
  if (!terms.length) return true;
  const haystack = [
    item.name,
    item.link,
    item.platform,
    item.model,
    item.brand,
    item.location,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.some((term) => haystack.includes(term));
};

const applyTermFilter = (
  items: SupplierSearchItem[],
  terms: string[],
  minCount: number
) => {
  const normalized = normalizeTerms(terms);
  if (!normalized.length) return items;
  const filtered = items.filter((item) => matchesTerms(item, normalized));
  return filtered.length >= minCount ? filtered : items;
};

const applyRangeFilter = (
  items: SupplierSearchItem[],
  range: { min: number; max: number } | null,
  selector: (item: SupplierSearchItem) => string | undefined,
  minCount: number
) => {
  if (!range) return items;
  const filtered = items.filter((item) => {
    const itemRange = parseNumericRange(selector(item) ?? "");
    if (!itemRange) return false;
    return itemRange.min <= range.max && itemRange.max >= range.min;
  });
  return filtered.length >= minCount ? filtered : items;
};

const inferSupplierType = (item: SupplierSearchItem) => {
  const hay = `${item.name ?? ""} ${item.link ?? ""}`.toLowerCase();
  if (hay.includes("factory") || hay.includes("manufactur") || hay.includes("plant")) {
    return "manufacturer";
  }
  if (hay.includes("trading") || hay.includes("import") || hay.includes("export")) {
    return "trading company";
  }
  return item.supplier_type ?? null;
};

const inferBadges = (item: SupplierSearchItem) => {
  const hay = `${item.name ?? ""} ${item.link ?? ""}`.toLowerCase();
  const badges: string[] = [];
  if (hay.includes("audited")) badges.push("Audited");
  if (hay.includes("gold")) badges.push("Gold Supplier");
  if (hay.includes("trade assurance") || hay.includes("trade-assurance"))
    badges.push("Trade Assurance");
  return badges.length ? badges : item.verification_badges ?? [];
};

const enrichSuppliers = (items: SupplierSearchItem[], limit = 30) => {
  const enriched = items.slice(0, limit).map((item) => ({
    ...item,
    supplier_type: item.supplier_type ?? inferSupplierType(item) ?? undefined,
    verification_badges: item.verification_badges?.length
      ? item.verification_badges
      : inferBadges(item),
  }));
  const tail = items.slice(limit);
  return [...enriched, ...tail];
};

const prioritizeSuppliers = (items: SupplierSearchItem[]) => {
  return [...items].sort((a, b) => {
    const priorityA = getPlatformPriority(a.platform) + (isPreferredSource(a) ? 1 : 0);
    const priorityB = getPlatformPriority(b.platform) + (isPreferredSource(b) ? 1 : 0);
    return priorityB - priorityA;
  });
};

const filterPreferredItems = (items: SupplierSearchItem[]) => {
  console.log(`[TRACE] filterPreferredItems: checking ${items.length} items`);
  return items.filter(
    (item) => {
      const isPreferred = isPreferredHost(item.link);
      const isLikely = isLikelyListingLink(item.link);
      const isValidName = isValidSupplierName(item.name);
      // ВРЕМЕННО: игнорируем isLikely по просьбе пользователя
      const passed = isPreferred && isValidName; 
      if (!passed) {
        console.log(`[TRACE] filterPreferredItems REJECTED: ${item.name} | Link: ${item.link} | Reason: pref=${isPreferred}, likely=${isLikely}, name=${isValidName}`);
      }
      return passed;
    }
  );
};

const filterValidItems = (items: SupplierSearchItem[]) => {
  console.log(`[TRACE] filterValidItems: checking ${items.length} items`);
  return items.filter((item) => {
    const isLikely = isLikelyListingLink(item.link);
    const isValidName = isValidSupplierName(item.name);
    // ВРЕМЕННО: игнорируем isLikely по просьбе пользователя
    const passed = isValidName; 
    if (!passed) {
      console.log(`[TRACE] filterValidItems REJECTED: ${item.name} | Link: ${item.link} | Reason: likely=${isLikely}, name=${isValidName}`);
    }
    return passed;
  });
};

const normalizeSupplierItems = (items: SupplierSearchItem[]) =>
  items.map((item) => {
    if (item.platform) return item;
    const inferred = inferPlatformFromLink(item.link);
    return inferred ? { ...item, platform: inferred } : item;
  });

const countPreferredSources = (items: SupplierSearchItem[]) => {
  const counts = { alibaba: 0, mic: 0 };
  for (const item of items) {
    // ВРЕМЕННО: игнорируем isLikely для отладки
    if (!isPreferredHost(item.link)) continue;
    const host = new URL(item.link ?? "").hostname.toLowerCase();
    if (host.includes("alibaba")) counts.alibaba += 1;
    if (host.includes("made-in-china")) counts.mic += 1;
  }
  return counts;
};

const mergeSuppliers = (baseItems: SupplierSearchItem[], extraItems: SupplierSearchItem[]) =>
  dedupeSuppliers(prioritizeSuppliers([...baseItems, ...extraItems]));

const pickPreviewItems = (items: SupplierSearchItem[], limit = 5) => {
  if (items.length <= limit) return items;
  const alibaba = items.find((item) => item.platform?.toLowerCase().includes("alibaba"));
  const mic = items.find((item) => item.platform?.toLowerCase().includes("made-in-china"));
  const selected: SupplierSearchItem[] = [];
  if (alibaba) selected.push(alibaba);
  if (mic && mic !== alibaba) selected.push(mic);
  for (const item of items) {
    if (selected.length >= limit) break;
    if (!selected.includes(item)) selected.push(item);
  }
  return selected.slice(0, limit);
};

const dedupeSuppliers = (items: SupplierSearchItem[]) => {
  console.log(`[TRACE] dedupeSuppliers: input ${items.length} items`);
  const map = new Map<string, SupplierSearchItem>();
  for (const item of items) {
    if (!isValidSupplierName(item.name)) {
      console.log(`[TRACE] dedupe REJECTED (invalid name): ${item.name}`);
      continue;
    }
    const key = normalizeCompanyName(item.name || "");
    if (!key) {
      console.log(`[TRACE] dedupe REJECTED (no key): ${item.name}`);
      continue;
    }
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    console.log(`[TRACE] dedupe CONFLICT: ${item.name} already exists. Keeping one.`);
    const existingPriority = getPlatformPriority(existing.platform);
    const nextPriority = getPlatformPriority(item.platform);
    if (!existing.link && item.link) {
      map.set(key, item);
    } else if (nextPriority > existingPriority) {
      map.set(key, item);
    }
  }
  const result = Array.from(map.values());
  console.log(`[TRACE] dedupeSuppliers: output ${result.length} items`);
  return result;
};

const scoreSuppliers = (
  items: SupplierSearchItem[],
  budgetRange: { min: number; max: number } | null,
  moqRange: { min: number; max: number } | null
) => {
  return items.map((item) => {
    let score = 50;
    const factors: string[] = [];

    if (isPreferredSource(item)) {
      score += 10;
    } else {
      score -= 5;
      factors.push("Источник вне приоритетных площадок");
    }

    const priceRange = parseNumericRange(item.price_range ?? "");
    if (budgetRange && priceRange) {
      const overlaps =
        priceRange.min <= budgetRange.max && priceRange.max >= budgetRange.min;
      if (overlaps) {
        score += 10;
      } else {
        score -= 10;
        factors.push("Цена вне заявленного диапазона");
      }
    }

    const moqValue = parseNumericRange(item.moq ?? "");
    if (moqRange && moqValue) {
      if (moqValue.min <= moqRange.max) {
        score += 5;
      } else {
        score -= 5;
        factors.push("MOQ выше ожидаемого");
      }
    }

    if (score >= 70) {
      item.risk_level = "low";
    } else if (score >= 40) {
      item.risk_level = "medium";
    } else {
      item.risk_level = "high";
      if (!factors.length) factors.push("Недостаточно данных для доверия");
    }
    item.risk_factors = factors;
    return item;
  });
};

// --- НОВЫЕ ТИПЫ ДЛЯ CSV ---
type CsvItem = {
  name: string;
  link: string;
  price: string;
  moq: string;
  platform: string;
};

// === АГЕНТ 1: CSV HARVESTER ===
const runHarvesterAgent = async (
  runOpenAI: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>,
  query: string,
  queries: string[]
): Promise<CsvItem[]> => {
  const csvPrompt = 
    `Role: Data Harvester. Task: Search for suppliers for "${query}". ` +
    `Use these queries: ${queries.join(" | ")}. ` +
    `Output Format: Raw Text with separator "|". ` +
    `Columns: Name|Link|Price|MOQ|Platform. ` +
    `Rules: ` +
    `1. Collect at least 20-30 items total. ` +
    `2. STRICTLY Valid Product Links only (product-detail). ` +
    `3. If price/MOQ is missing, put "n/a". ` +
    `4. Platform must be "Alibaba" or "MIC". ` +
    `5. Do NOT use markdown code blocks. One item per line.`;

  trace("Harvester", "Starting search...");
  
  const payload = {
    model: "gpt-4.1-mini",
    input: [
       { role: "system", content: csvPrompt },
       { role: "user", content: "Start harvesting." }
    ],
    tools: [{ type: "web_search" }],
    tool_choice: "auto" 
  };

  try {
    const data = await runOpenAI(payload);
    let content = getResponseText(data as Record<string, unknown> | null);
    
    // Чистим маркдаун, если модель его добавила
    content = content.replace(/```csv/g, "").replace(/```/g, "").trim();
    
    trace("Harvester Raw Output", content);

    return parseCsvOutput(content);
  } catch (e) {
    console.error("Harvester failed", e);
    return [];
  }
};

// Парсер CSV от LLM
const parseCsvOutput = (text: string): CsvItem[] => {
  const lines = text.split("\n").filter(l => l.trim().length > 10);
  const items: CsvItem[] = [];
  
  // 1. Попытка распарсить CSV
  for (const line of lines) {
    if (line.toLowerCase().includes("name|link") || line.toLowerCase().includes("name | link")) continue;
    if (line.match(/^[-=\s]+$/)) continue; // Пропуск разделителей таблиц

    // Убираем pipe в начале и конце строки, если они есть
    const cleanLine = line.trim().replace(/^\||\|$/g, "");

    // Сплитим очищенную строку
    const parts = cleanLine.split("|").map(p => p.trim());
    
    // Эвристика: ищем часть, начинающуюся с http
    const linkIndex = parts.findIndex(p => p.startsWith("http"));
    
    if (linkIndex !== -1) {
        const name = parts[0]; // Имя обычно первое
        const link = parts[linkIndex];
        const price = parts[linkIndex + 1] || "n/a";
        const moq = parts[linkIndex + 2] || "n/a";
        // Платформа или из колонки, или угадываем
        let platform = parts[linkIndex + 3] || "";
        if (!platform) {
            if (link.includes("alibaba")) platform = "Alibaba";
            else if (link.includes("made-in-china")) platform = "Made-in-China";
            else platform = "Other";
        }

        if (isValidListingLink(link)) {
            items.push({ name, link, price, moq, platform });
        }
    }
  }

  // 2. Fallback (План Б): Если CSV не сработал, просто граббим ссылки
  if (items.length === 0) {
      console.log("[Harvester] CSV parsing gave 0 items, trying Regex Fallback...");
      const urlRegex = /https?:\/\/[^\s)|>"]+/g;
      const matches = text.match(urlRegex) || [];
      
      for (const link of matches) {
          if (isValidListingLink(link)) {
             let platform = "Other";
             if (link.includes("alibaba")) platform = "Alibaba";
             else if (link.includes("made-in-china")) platform = "Made-in-China";
             
             items.push({ 
                 name: "Supplier Item (Auto-detected)", 
                 link: link, 
                 price: "Check Link", 
                 moq: "n/a", 
                 platform 
             });
          }
      }
  }

  trace("Harvester Parsed Items", items.length);
  return items;
};

// === АГЕНТ 2: SCREENER (FILTER) ===
const runScreenerAgent = (
  rawItems: CsvItem[]
): CsvItem[] => {
  trace("Screener Input", rawItems.length);

  const unique = new Map();
  rawItems.forEach(item => {
     if (!item.link) return;
     try {
       // Дедупликация: игнорируем http/https и www
       const cleanLink = item.link.toLowerCase().replace(/https?:\/\/(www\.)?/, "").split("?")[0];
       if (!unique.has(cleanLink)) unique.set(cleanLink, item);
     } catch { }
  });
  
  let filtered = Array.from(unique.values()) as CsvItem[];
  trace("Screener Output", filtered.length);
  
  return filtered.slice(0, 30);
};

// === АГЕНТ 3: ANALYST (ENRICH) ===
const runAnalystAgent = async (
  runOpenAI: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>,
  candidates: CsvItem[],
  query: string
): Promise<SupplierSearchResult | null> => {
  if (candidates.length === 0) return null;

  const csvBlock = candidates.map(i => `${i.name}|${i.link}|${i.price}|${i.moq}`).join("\n");

  const prompt = 
    `Role: Senior Procurement Analyst. ` +
    `Task: Analyze these ${candidates.length} supplier candidates for query: "${query}". ` +
    `Input Format: Name|Link|Price|MOQ. ` +
    `Steps: ` +
    `1. Select the top 10 best options based on relevance and credibility. ` +
    `2. Assign a risk level (Low/Medium/High). ` +
    `3. Output JSON: { summary, items: [ { name, link, price_range, moq, platform, risk_level, risk_factors[], location } ] }. ` +
    `Data:\n${csvBlock}`;

  const payload = {
    model: "gpt-4.1-mini",
    input: [
       { role: "system", content: "You are a JSON API. Output valid JSON only." },
       { role: "user", content: prompt }
    ]
  };

  trace("Analyst", "Starting final analysis...");
  const data = await runOpenAI(payload);
  const text = getResponseText(data as Record<string, unknown> | null);
  const candidate = extractJsonCandidate(text);
  if (!candidate) return null;
  return JSON.parse(candidate);
};

const resolveMode = (pageContext = "") => {
  const path = pageContext.toLowerCase();
  if (path.startsWith("/products/supplier-search")) return "supplier_search";
  if (
    path.startsWith("/products/company-check") ||
    path.startsWith("/products/export-profile") ||
    path.startsWith("/products/market-analysis") ||
    path.startsWith("/reports")
  ) {
    return "report";
  }
  return "assistant";
};

const buildModePrompt = (mode: string) => {
  switch (mode) {
    case "supplier_search":
      return (
        "Ты бот TradeLab в режиме Supplier Search. " +
        "Работай как guided flow: уточняющие вопросы → preview → подтверждение → полный результат. " +
        "Не обещай точность, указывай ограничения и источники. " +
        "Если данных недостаточно, проси уточнение." +
        "Финальный ответ всегда на русском языке, переводи все технические спецификации и условия."
      );
    case "report":
      return (
        "Ты бот TradeLab в режиме Report. " +
        "Помогаешь интерпретировать отчёты, объясняешь поля и риски, " +
        "предлагаешь логичный следующий шаг (P1/P2/P3/P4). " +
        "Всегда добавляй блоки «Источник» и «Ограничение»." +
        "Финальный ответ всегда на русском языке, переводи все технические спецификации и условия."
      );
    default:
      return (
        "Ты бот TradeLab в режиме Assistant. " +
        "Отвечай кратко и структурированно, без запуска полного поиска поставщиков. " +
        "Если пользователь просит найти поставщиков, предложи перейти в раздел /products/supplier-search." +
        "Финальный ответ всегда на русском языке, переводи все технические спецификации и условия."
      );
  }
};

const deriveSuggestedChips = (mode: string, lastUserMessage: string) => {
  if (mode !== "assistant") return [];
  const normalized = lastUserMessage.toLowerCase();
  if (
    normalized.includes("поставщик") ||
    normalized.includes("supplier") ||
    normalized.includes("поиск")
  ) {
    return [
      {
        id: "go-supplier-search",
        label: "Открыть поиск поставщиков",
        action: "redirect",
        payload: "/products/supplier-search",
      },
    ] as SuggestedChip[];
  }
  return [];
};

const buildReportUpsellChips = (
  pageContext: string,
  supplierNames: string[]
): SuggestedChip[] => {
  const trimmed = supplierNames.filter(Boolean).slice(0, 2);
  if (trimmed.length === 0) return [];
  if (pageContext.startsWith("/products/company-check")) {
    return trimmed.map((name, index) => ({
      id: `upsell-p1-${index}`,
      label: `Проверить ${name}`,
      action: "insert",
      payload: `Нужна справка по компании ${name}.`,
    }));
  }
  if (pageContext.startsWith("/products/export-profile")) {
    return trimmed.map((name, index) => ({
      id: `upsell-p2-${index}`,
      label: `Экспортный профиль: ${name}`,
      action: "insert",
      payload: `Экспортный профиль для ${name}, период 12 мес.`,
    }));
  }
  return [];
};

const formatSupplierPreview = (
  result: SupplierSearchResult,
  items: SupplierSearchItem[],
  foundCount: number
) => {
  const lines = [
    `Нашёл ${foundCount} предложений. Вот preview (3–5 примеров):`,
    items
      .slice(0, 5)
      .map((item, index) => {
        const parts = [
          `${index + 1}. ${item.name}`,
          item.platform ? `Площадка: ${item.platform}` : null,
          item.price_range ? `Цена: ${item.price_range}` : null,
          item.moq ? `MOQ: ${item.moq}` : null,
          item.location ? `Локация: ${item.location}` : null,
          item.link ? `Ссылка: ${item.link}` : null,
        ].filter(Boolean);
        return parts.join(" · ");
      })
      .join("\n"),
    "Источник: LLM web search",
    result.limitations ? `Ограничение: ${result.limitations}` : null,
  ].filter(Boolean);
  return lines.join("\n");
};

const formatSupplierFull = (result: SupplierSearchResult, items: SupplierSearchItem[]) => {
  const lines = [
    "Результат полного анализа (топ-10):",
    items
      .slice(0, 10)
      .map((item, index) => {
        const risk =
          item.risk_level === "low"
            ? "🟢 Низкий риск"
            : item.risk_level === "medium"
            ? "🟡 Средний риск"
            : item.risk_level === "high"
            ? "🔴 Высокий риск"
            : null;
        const parts = [
          `${index + 1}. ${item.name}`,
          item.platform ? `Площадка: ${item.platform}` : null,
          item.price_range ? `Цена: ${item.price_range}` : null,
          item.moq ? `MOQ: ${item.moq}` : null,
          item.location ? `Локация: ${item.location}` : null,
          risk,
          item.risk_factors && item.risk_factors.length
            ? `Факторы: ${item.risk_factors.join(", ")}`
            : null,
          item.link ? `Ссылка: ${item.link}` : null,
        ].filter(Boolean);
        return parts.join(" · ");
      })
      .join("\n"),
    result.bench?.price_range ? `Бенчмарк цены: ${result.bench.price_range}` : null,
    result.bench?.moq_range ? `Бенчмарк MOQ: ${result.bench.moq_range}` : null,
    "Источник: LLM web search",
    result.limitations ? `Ограничение: ${result.limitations}` : null,
  ].filter(Boolean);
  return lines.join("\n");
};

const buildSummary = (text: string, max = 180) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 3)}...` : cleaned;
};

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, message: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  // const apiKey = Deno.env.get("OPENAI_API_KEY");
  const apiKey = OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, message: "Missing OPENAI_API_KEY" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
  if (!P3_SEARCH_MODEL || !P3_BASE_MODEL) {
    return new Response(JSON.stringify({ ok: false, message: "Missing model configuration" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  let payloadData: ChatRequest;
  try {
    payloadData = (await req.json()) as ChatRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, message: "Invalid JSON payload" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const { messages = [], page_context, session_id, context } = payloadData ?? {};
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAdmin =
    supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ ok: false, message: "Missing Supabase admin config" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  const rateWindowMs = 60 * 1000;
  const rateLimitPerMinute = 30;
  const windowStart = new Date(Date.now() - rateWindowMs).toISOString();
  const { count: recentCount, error: rateError } = await supabaseAdmin
    .from("api_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userData.user.id)
    .eq("provider", "openai")
    .gte("created_at", windowStart);
  if (!rateError && typeof recentCount === "number" && recentCount >= rateLimitPerMinute) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: "Слишком много запросов. Подождите минуту и попробуйте снова.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
    );
  }

  const mode = resolveMode(page_context);
  const systemPrompt = buildModePrompt(mode);

  let userContext = "";
  const contextObject =
    context && typeof context === "object" && !Array.isArray(context)
      ? (context as Record<string, unknown>)
      : null;
  if (context) {
    userContext =
      typeof context === "string"
        ? `Контекст пользователя:\n${normalizeText(context, 500)}`
        : `Контекст пользователя (json):\n${normalizeText(JSON.stringify(context), 500)}`;
  }

  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const flowState =
    contextObject && typeof contextObject.flow_state === "object"
      ? (contextObject.flow_state as Record<string, unknown>)
      : null;
  const normalizedFromFlow =
    flowState && typeof flowState.normalized_search === "object"
      ? (flowState.normalized_search as SearchNormalization)
      : null;
  const rfqSuppliers =
    contextObject &&
    typeof contextObject.rfq === "object" &&
    Array.isArray((contextObject.rfq as Record<string, unknown>).suppliers)
      ? ((contextObject.rfq as Record<string, unknown>).suppliers as string[]).filter(Boolean)
      : [];
  const confirmActionId =
    (contextObject?.confirm as { action_id?: string } | undefined)?.action_id ??
    (flowState?.confirmed_action_id as string | undefined) ??
    null;
  const suggestedChips = deriveSuggestedChips(mode, lastUserMessage);

  const loadRecentSuppliers = async () => {
    const { data, error } = await supabaseAdmin
      .from("chat_entities")
      .select("entity_value, created_at")
      .eq("user_id", userData.user?.id ?? null)
      .eq("entity_type", "supplier_list")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return [];
    const value = data.entity_value as { suppliers?: string[] } | null;
    return Array.isArray(value?.suppliers) ? value?.suppliers ?? [] : [];
  };

  const reportSuppliers = mode === "report" ? await loadRecentSuppliers() : [];
  const reportUpsellChips =
    mode === "report" ? buildReportUpsellChips(page_context ?? "", reportSuppliers) : [];
  const combinedChips =
    reportUpsellChips.length > 0 ? [...suggestedChips, ...reportUpsellChips] : suggestedChips;
  let uiHints: UiHints =
    suggestedChips.length && suggestedChips[0]?.action === "redirect"
      ? { redirect_to: suggestedChips[0]?.payload }
      : {};

  const basePayload = {
    model: P3_BASE_MODEL,
    input: [
      { role: "system", content: [systemPrompt, userContext].filter(Boolean).join("\n\n") },
      ...(Array.isArray(messages) ? messages : []),
    ]
  };

  // const runOpenAI = async (payload: Record<string, unknown>) => {
  //   const response = await fetch("https://api.openai.com/v1/responses", {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       Authorization: `Bearer ${apiKey}`,
  //     },
  //     body: JSON.stringify(payload),
  //   });
  //   if (!response.ok) {
  //     const errorText = await response.text();
  //     console.error("OpenAI error", response.status, errorText);
  //     const model =
  //       typeof (payload as { model?: unknown }).model === "string"
  //         ? ((payload as { model?: string }).model ?? "")
  //         : "";
  //     const isModelError =
  //       response.status === 400 ||
  //       response.status === 404 ||
  //       /model/i.test(errorText) ||
  //       /not\s+found/i.test(errorText);
  //     if (model.startsWith("gpt-5") && isModelError && model !== P3_FALLBACK_MODEL) {
  //       const fallbackPayload = { ...payload, model: P3_FALLBACK_MODEL };
  //       return runOpenAI(fallbackPayload);
  //     }
  //     throw new Error("AI service unavailable");
  //   }
  //   return response.json();
  // };
  const { runOpenAI } = createOpenAIClient(apiKey);

  const ensureEvidenceBlocks = (text: string, source: string, limitation: string) => {
    const hasSource = /Источник:/i.test(text);
    const hasLimit = /Ограничение:/i.test(text);
    const cleaned = text.replace(/гарантирую|гарантия/gi, "не гарантирую");
    const lines = [cleaned.trim()];
    if (!hasSource) lines.push(`Источник: ${source}`);
    if (!hasLimit) lines.push(`Ограничение: ${limitation}`);
    return lines.join("\n");
  };

  const defaultSupplierLimitation =
    "Данные из открытых источников. Требуется дополнительная проверка.";
  const defaultToolLimitation =
    "Ответ без внешних источников, требуется проверка и не является юридической консультацией.";

  const persistEntities = async (entities: Record<string, unknown> | null) => {
    if (!entities) return;
    try {
      const entityType = Array.isArray(entities.suppliers)
        ? "supplier_list"
        : entities.tool
        ? "tool_query"
        : "extracted";
      await supabaseAdmin.from("chat_entities").insert({
        user_id: userData.user?.id ?? null,
        session_id: session_id ?? null,
        mode,
        entity_type: entityType,
        entity_value: entities,
      });
    } catch (error) {
      console.error("chat_entities insert error", error);
    }
  };

  const logP3Event = async (eventType: string, eventMeta?: Record<string, unknown> | null) => {
    try {
      await supabaseAdmin.from("p3_events").insert({
        user_id: userData.user?.id ?? null,
        session_id: session_id ?? null,
        event_type: eventType,
        event_meta: eventMeta ?? null,
      });
    } catch (error) {
      console.error("p3_events insert error", error);
    }
  };

  const allowedToolsByMode: Record<string, string[]> = {
    assistant: ["hs_classify", "company_lookup", "landed_cost_calc", "duty_calc", "risk_assessment"],
    supplier_search: ["supplier_search_preview", "supplier_search_full", "hs_classify", "risk_assessment"],
    report: ["hs_classify", "company_lookup", "landed_cost_calc", "duty_calc", "risk_assessment"],
  };

  const detectTool = (message: string) => {
    const text = message.toLowerCase();
    if (text.startsWith("что такое") || text.includes("что значит") || text.includes("расскажи про")) {
        return null; 
    }
    if (text.includes("hs") || text.includes("hs-код") || text.includes("код тнвэд")) {
      return "hs_classify";
    }
    if (
      text.includes("landed cost") ||
      text.includes("стоимость импорта") ||
      text.includes("полная стоимость")
    ) {
      return "landed_cost_calc";
    }
    if (text.includes("пошлин") || text.includes("duty")) {
      return "duty_calc";
    }
    if (text.includes("риск") || text.includes("risk")) {
      return "risk_assessment";
    }
    if (
      (text.includes("проверь") || text.includes("проверка")) &&
      (text.includes("компан") || text.includes("company"))
    ) {
      return "company_lookup";
    }
    return null;
  };


  const runToolCall = async (toolName: string, query: string) => {
    const prompts: Record<string, string> = {
      hs_classify:
        "Верни JSON: {hs_code, title, alternatives[], confidence, limitation}. " +
        "Если данных недостаточно, укажи alternatives и отметь это в limitation.",
      company_lookup:
        "Верни JSON: {company, uscc, status, location, notes, limitation}. " +
        "Если данных нет — явно укажи в limitation.",
      landed_cost_calc:
        "Верни JSON: {currency, fob, freight, insurance, duty_rate, vat_rate, duty_amount, vat_amount, total_cost, needs[], notes, limitation}. " +
        "Если не хватает данных, заполни needs.",
      duty_calc:
        "Верни JSON: {currency, customs_value, duty_rate, duty_amount, needs[], notes, limitation}. " +
        "Если не хватает данных, заполни needs.",
      risk_assessment:
        "Верни JSON: {level, factors[], mitigation[], limitation}.",
    };
    const toolPrompt = prompts[toolName] ?? "Верни JSON результата.";
    const payload = {
      ...basePayload,
      input: [
        { role: "system", content: toolPrompt },
        { role: "user", content: query },
      ]
    };
    const data = await runOpenAI(payload);
    const text = getResponseText(data as Record<string, unknown> | null);
    const candidate = extractJsonCandidate(text);
    if (!candidate) {
      return { result: null, raw: text };
    }
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      return { result: parsed, raw: text };
    } catch {
      return { result: null, raw: text };
    }
  };

  const formatToolResponse = (toolName: string, result: Record<string, unknown> | null) => {
    if (!result) {
      return "Не удалось получить результат. Уточните запрос.";
    }
    switch (toolName) {
      case "hs_classify":
        return [
          `HS-код: ${result.hs_code ?? "н/д"}`,
          result.title ? `Описание: ${result.title}` : null,
          Array.isArray(result.alternatives) && result.alternatives.length
            ? `Альтернативы: ${(result.alternatives as string[]).join(", ")}`
            : null,
          result.confidence ? `Уверенность: ${result.confidence}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      case "company_lookup":
        return [
          result.company ? `Компания: ${result.company}` : null,
          result.uscc ? `USCC: ${result.uscc}` : null,
          result.status ? `Статус: ${result.status}` : null,
          result.location ? `Локация: ${result.location}` : null,
          result.notes ? `Заметки: ${result.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      case "landed_cost_calc":
        return [
          result.total_cost ? `Итого: ${result.total_cost}` : null,
          result.duty_amount ? `Пошлина: ${result.duty_amount}` : null,
          result.vat_amount ? `НДС: ${result.vat_amount}` : null,
          Array.isArray(result.needs) && result.needs.length
            ? `Нужны данные: ${(result.needs as string[]).join(", ")}`
            : null,
          result.notes ? `Комментарий: ${result.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      case "duty_calc":
        return [
          result.duty_amount ? `Пошлина: ${result.duty_amount}` : null,
          result.duty_rate ? `Ставка: ${result.duty_rate}` : null,
          Array.isArray(result.needs) && result.needs.length
            ? `Нужны данные: ${(result.needs as string[]).join(", ")}`
            : null,
          result.notes ? `Комментарий: ${result.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      case "risk_assessment":
        return [
          result.level ? `Уровень риска: ${result.level}` : null,
          Array.isArray(result.factors) && result.factors.length
            ? `Факторы: ${(result.factors as string[]).join(", ")}`
            : null,
          Array.isArray(result.mitigation) && result.mitigation.length
            ? `Митигаторы: ${(result.mitigation as string[]).join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");
      default:
        return "Результат получен.";
    }
  };
  const buildSearchPrompt = (
    modeLabel: "preview" | "full",
    sourceFocus: "both" | "alibaba" | "made-in-china" = "both",
    searchQueries: string[] = []
  ) => {
    // Requesting 15-25 to ensure we have enough valid ones after filtering
    const scope = modeLabel === "preview" ? "15" : "25";
    const sourceLine =
      sourceFocus === "alibaba"
        ? "Ищи только на Alibaba.com, укажи ссылку и площадку."
        : sourceFocus === "made-in-china"
        ? "Ищи только на Made-in-China.com, укажи ссылку и площадку."
        : "Ищи только на Alibaba.com и Made-in-China.com, укажи ссылку и площадку.";
    const balanceLine =
      sourceFocus === "both"
        ? "В списке должны быть минимум 1 поставщик с Alibaba и 1 с Made-in-China (если такие есть по запросу). "
        : "";
    const queryLine = searchQueries.length
      ? `Используй поисковые запросы: ${searchQueries.join(" | ")}. `
      : "";
    return (
      "Ты ассистент TradeLab, выполняешь web search по запросу пользователя. " +
      `Верни только JSON в формате SupplierSearchResult. Пытайся найти минимум ${scope} релевантных поставщиков. ` +
      "ВАЖНО: Каждый товар должен быть от уникальной компании. Не возвращай несколько товаров от одного и того же поставщика. " +
      `${sourceLine} ` +
      "Используй только домены www.alibaba.com, m.alibaba.com и www.made-in-china.com. " +
      "Запрещены локализованные домены (russian.alibaba.com, ru.made-in-china.com). " +
      queryLine +
      balanceLine +
      "Обязательно используй только прямые ссылки на карточки товара/компании, не ссылки поиска, не image-similar, не статьи/блоги. " +
      "Не используй заглушки вроде 'Поставщик 1' — укажи реальное название компании с источника. " +
      "Если поле неизвестно, укажи 'н/д', но ссылка должна быть валидной карточкой. " +
      "Поля: summary, bench(price_range, moq_range), items[] (name, link, price, moq, platform), limitations. " +
      "Без лишнего текста, без markdown, без объяснений, только JSON."
    );
  };

  const parseSupplierResult = (raw: string): SupplierSearchResult | null => {
    try {
      const candidate = extractJsonCandidate(raw);
      if (!candidate) return null;
      const parsed = JSON.parse(candidate) as SupplierSearchResult;
      if (!parsed || !Array.isArray(parsed.items)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const runSupplierSearch = async (
    modeLabel: "preview" | "full",
    query: string,
    sourceFocus: "both" | "alibaba" | "made-in-china" = "both",
    searchQueries: string[] = []
  ) => {
    console.log(`[TRACE] runSupplierSearch START: mode=${modeLabel}, source=${sourceFocus}, queries=${searchQueries.length}`);
    const prompt = buildSearchPrompt(modeLabel, sourceFocus, searchQueries);
    const payload = {
      ...basePayload,
      model: P3_SEARCH_MODEL,
      input: [
        { role: "system", content: prompt },
        { role: "user", content: query },
      ],
      tools: [{ type: "web_search" }],
      tool_choice: { type: "web_search" },
    };
    const attempts = 1; // СТАЛО

    let lastData: Record<string, unknown> | null = null;
    let parsed: SupplierSearchResult | null = null;
    
    try {
        const data = await runOpenAI(payload);
        lastData = data;
        const text = getResponseText(data as Record<string, unknown> | null);
        trace("RAW LLM OUTPUT", text);
        
        parsed = parseSupplierResult(text);
        
        if (!parsed) {
             console.log("[TRACE] JSON parse failed. Returning empty result.");
             parsed = { summary: "Ошибка разбора данных", items: [] };
        }

        if (parsed?.items) {
          console.log(`[TRACE] parsed ${parsed.items.length} items from AI`);
        } else {
          console.log("[TRACE] no items parsed from AI response");
        }
    } catch (err) {
        console.error("[TRACE] Error in runSupplierSearch:", err);
    }

    return { data: lastData, parsed };
  };

  const refundTc = async (refId: string, reason: string) => {
    await supabaseAdmin.rpc("tc_apply_refund", {
      p_user_id: userData.user?.id ?? null,
      p_amount: P3_FULL_TC,
      p_reason: reason,
      p_ref_id: `refund:${refId}`,
    });
    await supabaseAdmin.from("api_usage").insert({
      provider: "openai",
      user_id: userData.user?.id ?? null,
      request_meta: {
        mode,
        stage: "refund",
        reason,
        ref_id: refId,
        page_context,
        session_id,
      },
      cost_estimate: null,
    });
  };

  const refundTcAmount = async (amount: number, refId: string, reason: string) => {
    await supabaseAdmin.rpc("tc_apply_refund", {
      p_user_id: userData.user?.id ?? null,
      p_amount: amount,
      p_reason: reason,
      p_ref_id: `refund:${refId}`,
    });
    await supabaseAdmin.from("api_usage").insert({
      provider: "openai",
      user_id: userData.user?.id ?? null,
      request_meta: {
        mode,
        stage: "refund",
        reason,
        ref_id: refId,
        page_context,
        session_id,
      },
      cost_estimate: null,
    });
  };

  try {
    const detectedTool = detectTool(lastUserMessage);
    if (detectedTool && allowedToolsByMode[mode]?.includes(detectedTool)) {
      const { result } = await runToolCall(detectedTool, lastUserMessage);
      const toolText = formatToolResponse(detectedTool, result);
      const responseText = ensureEvidenceBlocks(
        toolText,
        "LLM без внешних источников",
        (result?.limitation as string | undefined) ?? defaultToolLimitation
      );
      const toolCalls: ToolCall[] = [
        { name: detectedTool, args: { query: lastUserMessage }, result },
      ];
      const summary = buildSummary(responseText);
      const responsePayload = {
        ok: true,
        mode,
        message: responseText,
        response: responseText,
        suggested_chips: combinedChips,
        ui_hints: uiHints,
        tool_calls: toolCalls,
        entities: { tool: detectedTool, query: lastUserMessage },
        summary,
      };
      await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
      return new Response(JSON.stringify(responsePayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "supplier_search") {
      const isConfirmedFull = confirmActionId === "p3_full_v1";
      const isConfirmedFilters = confirmActionId === "p3_filters_v1";
      const isConfirmedRfq = confirmActionId === "p3_rfq_v1";
      const query = isConfirmedFull
        ? typeof flowState?.query === "string" && flowState.query.trim()
          ? flowState.query.trim()
          : lastUserMessage.trim()
        : lastUserMessage.trim();

      if (isConfirmedRfq) {
        const resolvedQuery =
          typeof flowState?.query === "string" && flowState.query.trim()
            ? flowState.query.trim()
            : lastUserMessage.trim();
        const rfqRef = `rfq:${session_id ?? Date.now()}`;
        const { data: balanceData, error: balanceError } = await supabaseAdmin.rpc("tc_get_balance", {
          p_user_id: userData.user?.id ?? null,
        });
        const balanceRow = Array.isArray(balanceData) && balanceData.length > 0 ? balanceData[0] : null;
        const balanceTotal = Number(balanceRow?.balance_total ?? 0);
        if (balanceError || balanceTotal < P3_RFQ_TC) {
          await logP3Event("error", { code: "insufficient_tc", stage: "rfq" });
          const responsePayload = {
            ok: true,
            mode,
            message: `Для RFQ нужно ${P3_RFQ_TC} TC. Пополните баланс, чтобы продолжить.`,
            response: `Для RFQ нужно ${P3_RFQ_TC} TC. Пополните баланс, чтобы продолжить.`,
            suggested_chips: [
              {
                id: "open-tc",
                label: "Открыть Trade Credits",
                action: "redirect",
                payload: "/trade-credits",
              },
            ],
            ui_hints: { show_paywall: true, progress_state: "paywall" },
            tool_calls: [],
            entities: { query: resolvedQuery },
            summary: null,
          };
          await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
          return new Response(JSON.stringify(responsePayload), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: debitData, error: debitError } = await supabaseAdmin.rpc("tc_apply_debit", {
          p_user_id: userData.user?.id ?? null,
          p_amount: P3_RFQ_TC,
          p_reason: "P3 RFQ",
          p_ref_id: rfqRef,
        });
        const debitRow = Array.isArray(debitData) && debitData.length > 0 ? debitData[0] : null;
        if (debitError || !debitRow?.success) {
          await logP3Event("error", { code: "debit_failed", stage: "rfq" });
          const responsePayload = {
            ok: true,
            mode,
            message: "Не удалось списать Trade Credits для RFQ. Попробуйте еще раз.",
            response: "Не удалось списать Trade Credits для RFQ. Попробуйте еще раз.",
            suggested_chips: [],
            ui_hints: { progress_state: "confirm" },
            tool_calls: [],
            entities: { query: resolvedQuery },
            summary: null,
          };
          await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
          return new Response(JSON.stringify(responsePayload), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const supplierList = rfqSuppliers.length > 0 ? rfqSuppliers.slice(0, 3) : [];
        const rfqPrompt = [
          "Сформируй короткий RFQ (Request for Quotation) на английском.",
          resolvedQuery ? `Товар и требования: ${resolvedQuery}.` : null,
          supplierList.length ? `Поставщики: ${supplierList.join(", ")}.` : null,
          "Укажи, что требуется: цена, MOQ, сроки, условия оплаты, гарантия, сертификаты.",
          "Ответь одним письмом без markdown и без лишних пояснений.",
        ]
          .filter(Boolean)
          .join(" ");
        try {
          const rfqResponse = await runOpenAI({
            model: basePayload.model,
            input: [
              {
                role: "system",
                content: "Ты помощник TradeLab. Пиши деловой RFQ для поставщиков.",
              },
              { role: "user", content: rfqPrompt },
            ]
          });
          const rfqText = getResponseText(rfqResponse as Record<string, unknown> | null) || "RFQ готов.";
          await supabaseAdmin.from("api_usage").insert({
            provider: "openai",
            user_id: userData.user?.id ?? null,
            request_meta: {
              mode,
              stage: "rfq",
              page_context,
              session_id,
              model: basePayload.model,
              suppliers: supplierList,
            },
            cost_estimate: null,
          });
          const responsePayload = {
            ok: true,
            mode,
            message: rfqText,
            response: rfqText,
            suggested_chips: [],
            ui_hints: { progress_state: "done" },
            tool_calls: [],
            entities: { query: resolvedQuery, rfq_suppliers: supplierList },
            summary: buildSummary(rfqText),
          };
          await logP3Event("rfq", {
            query: resolvedQuery,
            suppliers: supplierList,
          });
          await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
          return new Response(JSON.stringify(responsePayload), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch {
          await refundTcAmount(P3_RFQ_TC, rfqRef, "refund_p3_rfq_error");
          await logP3Event("error", { code: "rfq_failed" });
          const responsePayload = {
            ok: true,
            mode,
            message: "Не удалось сформировать RFQ. Средства возвращены.",
            response: "Не удалось сформировать RFQ. Средства возвращены.",
            suggested_chips: [],
            ui_hints: { progress_state: "preview" },
            tool_calls: [],
            entities: { query: resolvedQuery },
            summary: null,
          };
          await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
          return new Response(JSON.stringify(responsePayload), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (isConfirmedFilters) {
        const resolvedQuery =
          typeof flowState?.query === "string" && flowState.query.trim()
            ? flowState.query.trim()
            : lastUserMessage.trim();
        const responsePayload = {
          ok: true,
          mode,
          message:
            "Фильтры подтверждены. Можем запускать полный анализ и формировать отчёт.",
          response:
            "Фильтры подтверждены. Можем запускать полный анализ и формировать отчёт.",
          suggested_chips: [
            {
              id: "confirm-full",
              label: "Запустить полный анализ",
              action: "confirm",
              payload: "p3_full_v1",
            },
          ],
          ui_hints: { progress_state: "confirm", requires_confirm: true },
          tool_calls: [],
          entities: {
            query: resolvedQuery,
            normalized_search: normalizedFromFlow ?? null,
          },
          summary: null,
        };
        await logP3Event("confirm_filters", { query: resolvedQuery });
        await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
        return new Response(JSON.stringify(responsePayload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isConfirmedFull) {
        const currentRefine = (flowState?.refine_count as number | undefined) ?? 0;
        if (flowState?.step === "shortlist" && currentRefine >= 2) {
          const responsePayload = {
            ok: true,
            mode,
            message:
              "Достигнут лимит уточнений. Могу запустить полный анализ с текущими параметрами.",
            response:
              "Достигнут лимит уточнений. Могу запустить полный анализ с текущими параметрами.",
            suggested_chips: [
              {
                id: "confirm-full",
                label: "Запустить полный анализ",
                action: "confirm",
                payload: "p3_full_v1",
              },
            ],
            ui_hints: { progress_state: "confirm", requires_confirm: true },
            tool_calls: [],
            entities: {
              query,
              refine_count: currentRefine,
              normalized_search: normalizedFromFlow ?? null,
            },
            summary: null,
          };
          await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
          return new Response(JSON.stringify(responsePayload), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!query) {
          return new Response(
            JSON.stringify({
              ok: true,
              mode,
              message:
                "Опишите товар и ключевые параметры, чтобы начать поиск. Можно использовать шаблон.",
              response:
                "Опишите товар и ключевые параметры, чтобы начать поиск. Можно использовать шаблон.",
              suggested_chips: [
                {
                  id: "p3-intake-template",
                  label: "Заполнить параметры",
                  action: "insert",
                  payload: SUPPLIER_INTAKE_TEMPLATE,
                },
              ],
              ui_hints: { progress_state: "preview" },
              tool_calls: [],
              entities: null,
              summary: null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const normalizedSearch =
          normalizedFromFlow ?? (await normalizeSearchQuery(runOpenAI, query));
        const searchQueries = buildSearchQueries(normalizedSearch, "both");
        
        // --- START NEW FUNNEL PIPELINE ---
        const rawCsvItems = await runHarvesterAgent(runOpenAI, query, searchQueries);
        
        if (rawCsvItems.length === 0) {
           await logP3Event("error", { code: "harvester_empty", stage: "preview" });
           const responsePayload = {
             ok: true,
             mode,
             message: "Не удалось найти поставщиков по вашему запросу. Попробуйте уточнить параметры.",
             response: "Не удалось найти поставщиков по вашему запросу. Попробуйте уточнить параметры.",
             suggested_chips: [
               {
                 id: "p3-intake-template",
                 label: "Заполнить параметры",
                 action: "insert",
                 payload: SUPPLIER_INTAKE_TEMPLATE,
               },
             ],
             ui_hints: { progress_state: "preview" },
             tool_calls: [],
             entities: { query },
             summary: null,
           };
           return new Response(JSON.stringify(responsePayload), {
             headers: { ...corsHeaders, "Content-Type": "application/json" },
           });
        }

        const candidates = runScreenerAgent(rawCsvItems);
        const parsed = await runAnalystAgent(runOpenAI, candidates, query);
        
        if (!parsed) {
          await logP3Event("error", { code: "analyst_failed", stage: "preview" });
          const responsePayload = {
            ok: true,
            mode,
            message: "Ошибка анализа данных. Попробуйте еще раз.",
            response: "Ошибка анализа данных. Попробуйте еще раз.",
            suggested_chips: [],
            ui_hints: { progress_state: "preview" },
            tool_calls: [],
            entities: { query },
            summary: null,
          };
          return new Response(JSON.stringify(responsePayload), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const mergedItems = normalizeSupplierItems(parsed.items);
        const validItems = filterValidItems(mergedItems);
        const totalFound = rawCsvItems.length;
        const scoredItems = scoreSuppliers(mergedItems, null, null); 
        const foundCount = scoredItems.length;
        const previewItems = pickPreviewItems(scoredItems, 5);
        const sourceCounts = countPreferredSources(validItems);
        
        await logP3Event("quality_metrics", {
          stage: "preview",
          ...buildQualityMetrics(scoredItems),
          sourceCounts,
        });

        const previewResult = {
          ...parsed,
          limitations: parsed.limitations || "Результаты на основе веб-поиска.",
        };

        uiHints = {
          ...uiHints,
          progress_state: "shortlist",
          requires_confirm: true,
          confirm_action_id: "p3_filters_v1",
        };
        const responseText = ensureEvidenceBlocks(
          formatSupplierPreview(previewResult, previewItems, foundCount),
          "LLM web search",
          defaultSupplierLimitation
        );

        const dedupedCount = candidates.length;
        const usage = null; // No usage tracking for agents in simplified mode

        let searchId: string | null = null;
        const existingSearchId =
          typeof flowState?.search_id === "string" ? flowState.search_id : null;
        if (existingSearchId) {
          const { data } = await supabaseAdmin
            .from("supplier_searches")
            .update({
              query,
              status: "preview",
              source_counts: sourceCounts,
              stats: { totalFound, dedupedCount, previewCount: previewItems.length },
              limitations: previewResult.limitations ?? null,
            })
            .eq("id", existingSearchId)
            .select("id")
            .single();
          searchId = data?.id ?? null;
        }
        if (!searchId) {
          const { data } = await supabaseAdmin
            .from("supplier_searches")
            .insert({
              user_id: userData.user?.id ?? null,
              session_id: session_id ?? null,
              query,
              status: "preview",
              source_counts: sourceCounts,
              stats: { totalFound, dedupedCount, previewCount: previewItems.length },
              limitations: previewResult.limitations ?? null,
            })
            .select("id")
            .single();
          searchId = data?.id ?? null;
        }

        await supabaseAdmin.from("api_usage").insert({
          provider: "openai",
          user_id: userData.user?.id ?? null,
          request_meta: {
            mode,
            stage: "preview",
            page_context,
            session_id,
            model: basePayload.model,
            usage,
            itemsCount: scoredItems.length,
          },
          cost_estimate: null,
        });

        const nextRefineCount =
          flowState?.step === "shortlist" ? currentRefine + 1 : currentRefine;
        const responsePayload = {
          ok: true,
          mode,
          message: responseText,
          response: responseText,
          suggested_chips: [
            {
              id: "confirm-filters",
              label: "Подтвердить фильтры",
              action: "confirm",
              payload: "p3_filters_v1",
            },
            {
              id: "edit-filters",
              label: "Уточнить параметры",
              action: "insert",
              payload: SUPPLIER_INTAKE_TEMPLATE,
            },
          ],
          ui_hints: uiHints,
          tool_calls: [
            {
              name: "supplier_search_preview",
              args: { query },
              result: { itemsCount: scoredItems.length, sources: sourceCounts },
            },
          ],
          entities: {
            query,
            search_id: searchId,
            suppliers: scoredItems.map((item) => item.name),
            result_scope: "preview",
            result_items: previewItems,
            bench: parsed.bench ?? null,
            limitations: parsed.limitations ?? null,
            found_count: foundCount,
            total_found: totalFound,
            deduped_count: dedupedCount,
            final_count: scoredItems.length,
            source_counts: sourceCounts,
            preview_count: previewItems.length,
            refine_count: nextRefineCount,
            normalized_search: normalizedSearch ?? normalizedFromFlow ?? null,
          },
          summary: buildSummary(responseText),
        };
        await logP3Event("preview", {
          query,
          foundCount,
          dedupedCount,
          previewCount: previewItems.length,
          sourceCounts,
        });
        await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
        return new Response(JSON.stringify(responsePayload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!query) {
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message: "Не хватает данных для запуска анализа. Уточните запрос.",
            response: "Не хватает данных для запуска анализа. Уточните запрос.",
            suggested_chips: [],
            ui_hints: { progress_state: "preview" },
            tool_calls: [],
            entities: null,
            summary: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const existingSearchId =
        typeof flowState?.search_id === "string" ? flowState.search_id : null;
      const idempotencyKey = buildIdempotencyKey(query, session_id ?? null, existingSearchId);
      const { data: existingOrder } = await supabaseAdmin
        .from("orders")
        .select("id,status")
        .eq("user_id", userData.user?.id ?? null)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingOrder?.status === "processing") {
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message: "Анализ уже запущен. Пожалуйста, подождите несколько минут.",
            response: "Анализ уже запущен. Пожалуйста, подождите несколько минут.",
            suggested_chips: [],
            ui_hints: { progress_state: "analysis" },
            tool_calls: [],
            entities: { query, search_id: existingSearchId },
            summary: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (existingOrder?.status === "done") {
        const { data: existingReport } = await supabaseAdmin
          .from("reports")
          .select("id,web_report_url")
          .eq("order_id", existingOrder.id)
          .maybeSingle();
        const reportUrl = existingReport?.web_report_url ?? (existingReport?.id ? `/reports/${existingReport.id}` : null);
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message: "Отчёт уже готов. Откройте его для просмотра.",
            response: "Отчёт уже готов. Откройте его для просмотра.",
            suggested_chips: reportUrl
              ? [
                  {
                    id: "open-report",
                    label: "Открыть отчет",
                    action: "redirect",
                    payload: reportUrl,
                  },
                ]
              : [],
            ui_hints: { progress_state: "done" },
            tool_calls: [],
            entities: { query, search_id: existingSearchId, report_id: existingReport?.id ?? null },
            summary: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await logP3Event("confirm_full", { query, search_id: existingSearchId });
      await supabaseAdmin.from("api_usage").insert({
        provider: "openai",
        user_id: userData.user?.id ?? null,
        request_meta: {
          mode,
          stage: "confirm",
          page_context,
          session_id,
          query,
        },
        cost_estimate: null,
      });
      const { data: balanceData, error: balanceError } = await supabaseAdmin.rpc(
        "tc_get_balance",
        { p_user_id: userData.user?.id ?? null }
      );
      const balanceRow =
        Array.isArray(balanceData) && balanceData.length > 0 ? balanceData[0] : null;
      const balanceTotal = Number(balanceRow?.balance_total ?? 0);
      if (balanceError || balanceTotal < P3_FULL_TC) {
        await logP3Event("error", { code: "insufficient_tc", stage: "full" });
        const responsePayload = {
          ok: true,
          mode,
          message: `Для полного анализа нужно ${P3_FULL_TC} TC. Пополните баланс, чтобы продолжить.`,
          response: `Для полного анализа нужно ${P3_FULL_TC} TC. Пополните баланс, чтобы продолжить.`,
          suggested_chips: [
            {
              id: "open-tc",
              label: "Открыть Trade Credits",
              action: "redirect",
              payload: "/trade-credits",
            },
          ],
          ui_hints: { show_paywall: true, progress_state: "paywall" },
          tool_calls: [
            {
              name: "supplier_search_full",
              args: { query },
              result: { blocked: true, reason: "insufficient_tc" },
            },
          ],
          entities: { query, normalized_search: normalizedFromFlow ?? null },
          summary: null,
        };
        await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
        return new Response(JSON.stringify(responsePayload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      uiHints = { ...uiHints, show_paywall: true, progress_state: "analysis" };
      const { data: order, error: orderError } = await supabaseAdmin
        .from("orders")
        .insert({
          user_id: userData.user?.id ?? null,
          product_type: "p3",
          status: "processing",
          price: P3_FULL_USD,
          currency: "USD",
          idempotency_key: idempotencyKey,
        })
        .select("id")
        .single();
      if (orderError || !order?.id) {
        await logP3Event("error", { code: "order_failed", stage: "full" });
        const responsePayload = {
          ok: true,
          mode,
          message: "Не удалось создать заказ. Попробуйте еще раз, списания не было.",
          response: "Не удалось создать заказ. Попробуйте еще раз, списания не было.",
          suggested_chips: [],
          ui_hints: { show_paywall: true, progress_state: "confirm" },
          tool_calls: [
            {
              name: "supplier_search_full",
              args: { query },
              result: { blocked: true, reason: "order_failed" },
            },
          ],
          entities: { query, normalized_search: normalizedFromFlow ?? null },
          summary: null,
        };
        await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
        return new Response(JSON.stringify(responsePayload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const debitRef = order.id;
      const { data: debitData, error: debitError } = await supabaseAdmin.rpc(
        "tc_apply_debit",
        {
          p_user_id: userData.user?.id ?? null,
          p_amount: P3_FULL_TC,
          p_reason: "P3 full analysis",
          p_ref_id: debitRef,
        }
      );
      const debitRow =
        Array.isArray(debitData) && debitData.length > 0 ? debitData[0] : null;
      if (debitError || !debitRow?.success) {
        await logP3Event("error", { code: "debit_failed", stage: "full" });
        if (order?.id) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "failed", error_reason: "debit_failed" })
            .eq("id", order.id);
        }
        const responsePayload = {
          ok: true,
          mode,
          message:
            "Не удалось списать Trade Credits. Проверьте баланс и повторите попытку.",
          response: "Не удалось списать Trade Credits. Проверьте баланс и повторите попытку.",
          suggested_chips: [
            {
              id: "open-tc",
              label: "Открыть Trade Credits",
              action: "redirect",
              payload: "/trade-credits",
            },
          ],
          ui_hints: { show_paywall: true, progress_state: "paywall" },
          tool_calls: [
            {
              name: "supplier_search_full",
              args: { query },
              result: { blocked: true, reason: "debit_failed" },
            },
          ],
          entities: { query, normalized_search: normalizedFromFlow ?? null },
          summary: null,
        };
        await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
        return new Response(JSON.stringify(responsePayload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // const normalizedSearch =
      //   normalizedFromFlow ?? (await normalizeSearchQuery(runOpenAI, query));
      // const searchQueries = buildSearchQueries(normalizedSearch, "both");
      // const { data, parsed } = await runSupplierSearch("full", query, "both", searchQueries);
      // const usage = data?.usage ?? null;

      try {
        const normalizedSearch =
          normalizedFromFlow ?? (await normalizeSearchQuery(runOpenAI, query));
        const searchQueries = buildSearchQueries(normalizedSearch, "both");
        
        // --- START NEW FUNNEL PIPELINE ---
        const rawCsvItems = await runHarvesterAgent(runOpenAI, query, searchQueries);
        
        if (rawCsvItems.length === 0) {
           await logP3Event("error", { code: "harvester_empty", stage: "full" });
           await refundTc(debitRef, "harvester_empty");
           return new Response(JSON.stringify({
             ok: true, mode, message: "Не удалось найти поставщиков. Попробуйте уточнить запрос.", response: "Не удалось найти поставщиков.", suggested_chips: [], ui_hints: { progress_state: "preview" }
           }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const candidates = runScreenerAgent(rawCsvItems);
        const parsed = await runAnalystAgent(runOpenAI, candidates, query);
        
        if (!parsed) {
          await logP3Event("error", { code: "analyst_failed", stage: "full" });
          await refundTc(debitRef, "analyst_failed");
          return new Response(JSON.stringify({
             ok: true, mode, message: "Ошибка анализа данных. Средства возвращены.", response: "Ошибка анализа данных.", suggested_chips: [], ui_hints: { progress_state: "preview" }
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const mergedItems = normalizeSupplierItems(parsed.items);
        const budgetRange = parseBudgetFromQuery(query);
        const moqRange = parseMoqFromQuery(query);
        const validItems = filterValidItems(mergedItems);
        
        const totalFound = rawCsvItems.length;
        const preferredItems = filterPreferredItems(mergedItems);
        const scoredItems = scoreSuppliers(mergedItems, budgetRange, moqRange);
        const foundCount = scoredItems.length;
        const dedupedCount = candidates.length;
        const enrichedItems = enrichSuppliers(scoredItems, 30);
        const sourceCounts = countPreferredSources(validItems);
        const usage = null;

        await logP3Event("quality_metrics", {
          stage: "full",
          ...buildQualityMetrics(enrichedItems),
          sourceCounts,
        });

        const fullResult = {
          ...parsed,
          limitations: parsed.limitations || "Данные из открытых источников.",
        };

        const responseText = ensureEvidenceBlocks(
          formatSupplierFull(fullResult, enrichedItems),
          "LLM web search",
          defaultSupplierLimitation
        );
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: report } = await supabaseAdmin
        .from("reports")
        .insert({
          order_id: order?.id ?? null,
          user_id: userData.user?.id ?? null,
          product_type: "p3",
          status: "processing",
          params: { query },
          expires_at: expiresAt,
          idempotency_key: idempotencyKey,
        })
        .select("id")
        .single();
      if (!report?.id) {
        await logP3Event("error", { code: "report_create_failed", stage: "full" });
        await refundTc(debitRef, "refund_p3_report_error");
        if (order?.id) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "failed", error_reason: "report_create_failed" })
            .eq("id", order.id);
        }
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message: "Отчет не сформирован. Средства возвращены. Попробуйте позже.",
            response: "Отчет не сформирован. Средства возвращены. Попробуйте позже.",
            suggested_chips: [],
            ui_hints: { progress_state: "preview" },
            tool_calls: [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const summaryPayload = {
        title: "Поиск поставщиков (P3)",
        summary: parsed.summary,
        bench: {
          priceRange: parsed.bench?.price_range ?? null,
          moqRange: parsed.bench?.moq_range ?? null,
        },
        items: enrichedItems.slice(0, 10).map((item) => ({
          source: item.platform,
          title: item.name,
          price: item.price_range ?? null,
          moq: item.moq ?? null,
          location: item.location ?? null,
          model: item.model ?? null,
          brand: item.brand ?? null,
          supplier_type: item.supplier_type ?? null,
          years_on_platform: item.years_on_platform ?? null,
          verification_badges: item.verification_badges ?? null,
          img_url: item.img_url ?? null,
          url: item.link ?? null,
        })),
        query,
        source: "LLM web search",
        limitation: parsed.limitations ?? "Данные из открытых источников. Требуется проверка.",
        stats: {
          totalFound,
          dedupedCount,
          finalCount: enrichedItems.length,
        },
      };

      if (report?.id) {
        await supabaseAdmin
          .from("reports")
          .update({
            status: "ready",
            result_summary: summaryPayload,
            web_report_url: `/reports/${report.id}`,
          })
          .eq("id", report.id);
      }
      if (order?.id) {
        await supabaseAdmin.from("orders").update({ status: "done" }).eq("id", order.id);
      }
      await logP3Event("full", {
        query,
        report_id: report?.id ?? null,
        finalCount: scoredItems.length,
        sourceCounts,
      });

      let searchId: string | null =
        typeof flowState?.search_id === "string" ? flowState.search_id : null;
      if (searchId) {
        const { data } = await supabaseAdmin
          .from("supplier_searches")
          .update({
            query,
            status: "full",
            source_counts: sourceCounts,
            stats: { totalFound, dedupedCount, finalCount: scoredItems.length },
            limitations: fullResult.limitations ?? null,
            last_report_id: report?.id ?? null,
          })
          .eq("id", searchId)
          .select("id")
          .single();
        searchId = data?.id ?? searchId;
      } else {
        const { data } = await supabaseAdmin
          .from("supplier_searches")
          .insert({
            user_id: userData.user?.id ?? null,
            session_id: session_id ?? null,
            query,
            status: "full",
            source_counts: sourceCounts,
            stats: { totalFound, dedupedCount, finalCount: scoredItems.length },
            limitations: fullResult.limitations ?? null,
            last_report_id: report?.id ?? null,
          })
          .select("id")
          .single();
        searchId = data?.id ?? null;
      }

      if (searchId) {
        await supabaseAdmin.from("supplier_reports").insert({
          user_id: userData.user?.id ?? null,
          search_id: searchId,
          report_id: report?.id ?? null,
          result_summary: summaryPayload,
          expires_at: expiresAt,
        });
        await supabaseAdmin.from("supplier_search_messages").insert([
          {
            user_id: userData.user?.id ?? null,
            search_id: searchId,
            role: "user",
            content: query,
          },
          {
            user_id: userData.user?.id ?? null,
            search_id: searchId,
            role: "assistant",
            content: responseText,
          },
        ]);
      }

      await supabaseAdmin.from("api_usage").insert({
        provider: "openai",
        user_id: userData.user?.id ?? null,
        request_meta: {
          mode,
          stage: "full",
          page_context,
          session_id,
          model: basePayload.model,
          usage,
          itemsCount: scoredItems.length,
          reportId: report?.id ?? null,
        },
        cost_estimate: null,
      });

      const responsePayload = {
        ok: true,
        mode,
        message: responseText,
        response: responseText,
        suggested_chips: [],
        ui_hints: uiHints,
        tool_calls: [
          {
            name: "supplier_search_full",
            args: { query, reportId: report?.id ?? null },
            result: { itemsCount: enrichedItems.length, sources: sourceCounts },
          },
        ],
        entities: {
          query,
          search_id: searchId,
          suppliers: enrichedItems.map((item) => item.name),
          result_scope: "full",
          result_items: enrichedItems.slice(0, 10),
          bench: parsed.bench ?? null,
          limitations: parsed.limitations ?? null,
          found_count: foundCount,
          total_found: totalFound,
          deduped_count: dedupedCount,
          final_count: enrichedItems.length,
          source_counts: sourceCounts,
          report_id: report?.id ?? null,
        },
        summary: buildSummary(responseText),
      };
      await persistEntities((responsePayload.entities ?? null) as Record<string, unknown> | null);
      return new Response(JSON.stringify(responsePayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      } catch (error) {
        await refundTc(debitRef, "refund_p3_full_error");
        await logP3Event("error", {
          code: "full_generation_failed",
          stage: "full",
          message: error instanceof Error ? error.message : "unknown_error",
        });
        if (order?.id) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "failed", error_reason: "full_generation_failed" })
            .eq("id", order.id);
        }
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message: "Полный анализ не сформирован. Средства возвращены. Попробуйте позже.",
            response: "Полный анализ не сформирован. Средства возвращены. Попробуйте позже.",
            suggested_chips: [],
            ui_hints: { progress_state: "preview" },
            tool_calls: [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (mode === "assistant") {
      const normalized = lastUserMessage.toLowerCase();
      if (confirmActionId === "p3_full_v1") {
        const text =
          "Полный поиск доступен только в разделе Supplier Search. " +
          "Откройте его, чтобы запустить платный анализ.";
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message: text,
            response: text,
            suggested_chips: [
              {
                id: "go-supplier-search",
                label: "Открыть поиск поставщиков",
                action: "redirect",
                payload: "/products/supplier-search",
              },
            ],
            ui_hints: { redirect_to: "/products/supplier-search" },
            tool_calls: [],
            entities: null,
            summary: buildSummary(text),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (
        normalized.includes("поставщик") ||
        normalized.includes("supplier") ||
        normalized.includes("поиск постав")
      ) {
        const text =
          "Полный поиск поставщиков доступен в разделе Supplier Search. " +
          "Перейдите туда, чтобы запустить поиск и получить результат.";
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message: text,
            response: text,
            suggested_chips: combinedChips.length
              ? combinedChips
              : [
              {
                id: "go-supplier-search",
                label: "Открыть поиск поставщиков",
                action: "redirect",
                payload: "/products/supplier-search",
              },
            ],
            ui_hints: { redirect_to: "/products/supplier-search" },
            tool_calls: [],
            entities: null,
            summary: buildSummary(text),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const data = await runOpenAI(basePayload);
    const text = getResponseText(data as Record<string, unknown> | null) || "Нет ответа.";
    const usage = data?.usage ?? null;
    const responseText = ensureEvidenceBlocks(
      text,
      "Внутренние знания и контекст страницы",
      "Ответ может быть неполным и требует проверки."
    );

    await supabaseAdmin.from("api_usage").insert({
      provider: "openai",
      user_id: userData.user?.id ?? null,
      request_meta: {
        mode,
        page_context,
        session_id,
        model: basePayload.model,
        usage,
      },
      cost_estimate: null,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        mode,
        message: responseText,
        response: responseText,
        suggested_chips: combinedChips,
        ui_hints: uiHints,
        tool_calls: [],
        entities: null,
        summary: buildSummary(responseText),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    await supabaseAdmin.from("api_usage").insert({
      provider: "openai",
      user_id: userData.user?.id ?? null,
      request_meta: {
        mode,
        page_context,
        session_id,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      cost_estimate: null,
    });
    console.error("chat_handler error", error);
    return new Response(
      JSON.stringify({ ok: false, message: "AI service unavailable" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
    );
  }
});
