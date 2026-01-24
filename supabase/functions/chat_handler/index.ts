import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  action: "redirect" | "insert";
  payload: string;
};

type UiHints = {
  redirect_to?: string;
  show_paywall?: boolean;
  progress_state?: string;
};

type SupplierSearchItem = {
  name: string;
  platform: string;
  price_range?: string;
  moq?: string;
  location?: string;
  link?: string;
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

type ToolCall = {
  name: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
};

const normalizeText = (value: string | null | undefined, max = 360) => {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
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
        "Если данных недостаточно, проси уточнение."
      );
    case "report":
      return (
        "Ты бот TradeLab в режиме Report. " +
        "Помогаешь интерпретировать отчёты, объясняешь поля и риски, " +
        "предлагаешь логичный следующий шаг (P1/P2/P3/P4). " +
        "Всегда добавляй блоки «Источник» и «Ограничение»."
      );
    default:
      return (
        "Ты бот TradeLab в режиме Assistant. " +
        "Отвечай кратко и структурированно, без запуска полного поиска поставщиков. " +
        "Если пользователь просит найти поставщиков, предложи перейти в раздел /products/supplier-search."
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

const formatSupplierPreview = (result: SupplierSearchResult) => {
  const lines = [
    "Вот preview (3–5 примеров):",
    result.items
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

const formatSupplierFull = (result: SupplierSearchResult) => {
  const lines = [
    "Результат полного анализа (топ-10):",
    result.items
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, message: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, message: "Missing OPENAI_API_KEY" }), {
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

  const mode = resolveMode(page_context);
  const systemPrompt = buildModePrompt(mode);

  let userContext = "";
  if (context) {
    userContext =
      typeof context === "string"
        ? `Контекст пользователя:\n${normalizeText(context, 500)}`
        : `Контекст пользователя (json):\n${normalizeText(JSON.stringify(context), 500)}`;
  }

  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const suggestedChips = deriveSuggestedChips(mode, lastUserMessage);
  let uiHints: UiHints =
    suggestedChips.length && suggestedChips[0]?.action === "redirect"
      ? { redirect_to: suggestedChips[0]?.payload }
      : {};

  const basePayload = {
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: [systemPrompt, userContext].filter(Boolean).join("\n\n") },
      ...(Array.isArray(messages) ? messages : []),
    ],
    temperature: 0.3,
  };

  const runOpenAI = async (payload: Record<string, unknown>) => {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error", response.status, errorText);
      throw new Error("AI service unavailable");
    }
    return response.json();
  };

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
  const defaultToolLimitation = "Ответ требует проверки и не является юридической консультацией.";

  const allowedToolsByMode: Record<string, string[]> = {
    assistant: ["hs_classify", "company_lookup", "landed_cost_calc", "duty_calc", "risk_assessment"],
    supplier_search: ["supplier_search_preview", "supplier_search_full", "hs_classify", "risk_assessment"],
    report: ["hs_classify", "company_lookup", "landed_cost_calc", "duty_calc", "risk_assessment"],
  };

  const detectTool = (message: string) => {
    const text = message.toLowerCase();
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

  const repairSupplierJson = async (raw: string) => {
    const repairPayload = {
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content:
            "Ты исправляешь JSON для SupplierSearchResult. Верни только валидный JSON. " +
            "Формат: summary, bench(price_range, moq_range), items[] (name, platform, price_range, moq, location, link, risk_level, risk_factors), limitations.",
        },
        { role: "user", content: raw },
      ],
      temperature: 0.1,
    };
    const data = await runOpenAI(repairPayload);
    const text =
      data.output_text ??
      data?.output?.[0]?.content?.[0]?.text ??
      "";
    return parseSupplierResult(text);
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
      ],
      temperature: 0.2,
    };
    const data = await runOpenAI(payload);
    const text =
      data.output_text ??
      data?.output?.[0]?.content?.[0]?.text ??
      "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return { result: null, raw: text };
    }
    try {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
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
  const buildSearchPrompt = (modeLabel: "preview" | "full") => {
    const scope = modeLabel === "preview" ? "3–5" : "10";
    return (
      "Ты ассистент TradeLab, выполняешь web search по запросу пользователя. " +
      `Верни только JSON в формате SupplierSearchResult. Нужны ${scope} поставщиков. ` +
      "Поля: summary, bench(price_range, moq_range), items[] (name, platform, price_range, moq, location, link, risk_level, risk_factors), limitations. " +
      "Без лишнего текста и без markdown."
    );
  };

  const parseSupplierResult = (raw: string): SupplierSearchResult | null => {
    try {
      const trimmed = raw.trim();
      const jsonStart = trimmed.indexOf("{");
      const jsonEnd = trimmed.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) return null;
      const candidate = trimmed.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(candidate) as SupplierSearchResult;
      if (!parsed || !Array.isArray(parsed.items)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const runSupplierSearch = async (modeLabel: "preview" | "full") => {
    const prompt = buildSearchPrompt(modeLabel);
    const payload = {
      ...basePayload,
      input: [
        { role: "system", content: prompt },
        { role: "user", content: lastUserMessage },
      ],
      tools: [{ type: "web_search" }],
    };
    const attempts = 2;
    let lastData: Record<string, unknown> | null = null;
    let parsed: SupplierSearchResult | null = null;
    for (let i = 0; i < attempts; i += 1) {
      const data = await runOpenAI(payload);
      lastData = data;
      const text =
        data.output_text ??
        data?.output?.[0]?.content?.[0]?.text ??
        "";
      parsed = parseSupplierResult(text);
      if (parsed) break;
      parsed = await repairSupplierJson(text);
      if (parsed) break;
    }
    return { data: lastData, parsed };
  };

  const refundTc = async (refId: string, reason: string) => {
    await supabaseAdmin.rpc("tc_apply_credit", {
      p_user_id: userData.user?.id ?? null,
      p_amount: 500,
      p_credit_type: "bonus",
      p_reason: reason,
      p_expires_at: null,
      p_ref_id: `refund:${refId}`,
    });
  };

  try {
    const detectedTool = detectTool(lastUserMessage);
    if (detectedTool && allowedToolsByMode[mode]?.includes(detectedTool)) {
      const { result } = await runToolCall(detectedTool, lastUserMessage);
      const toolText = formatToolResponse(detectedTool, result);
      const responseText = ensureEvidenceBlocks(
        toolText,
        "Внутренние знания и контекст страницы",
        (result?.limitation as string | undefined) ?? defaultToolLimitation
      );
      const toolCalls: ToolCall[] = [
        { name: detectedTool, args: { query: lastUserMessage }, result },
      ];
      const summary = buildSummary(responseText);
      return new Response(
        JSON.stringify({
          ok: true,
          mode,
          message: responseText,
          response: responseText,
          suggested_chips: suggestedChips,
          ui_hints: uiHints,
          tool_calls: toolCalls,
          entities: { tool: detectedTool, query: lastUserMessage },
          summary,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "supplier_search") {
      const normalized = lastUserMessage.toLowerCase();
      const wantsFull =
        normalized.includes("полный") ||
        normalized.includes("запустить") ||
        normalized.includes("подтверд");

      if (!wantsFull) {
        const { data, parsed } = await runSupplierSearch("preview");
        const usage = data?.usage ?? null;
        if (!parsed) {
          await supabaseAdmin.from("api_usage").insert({
            provider: "openai",
            user_id: userData.user?.id ?? null,
            request_meta: {
              mode,
              stage: "preview",
              page_context,
              session_id,
              model: basePayload.model,
              error: "parse_failed",
            },
            cost_estimate: null,
          });
          return new Response(
            JSON.stringify({
              ok: true,
              mode,
              message:
                "Не удалось сформировать preview. Уточните запрос (товар, материалы, MOQ, бюджет).",
              response:
                "Не удалось сформировать preview. Уточните запрос (товар, материалы, MOQ, бюджет).",
              suggested_chips: [],
              ui_hints: { progress_state: "preview" },
              tool_calls: [
                {
                  name: "supplier_search_preview",
                  args: { query: lastUserMessage },
                  result: null,
                },
              ],
              entities: { query: lastUserMessage },
              summary: null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        uiHints = { ...uiHints, progress_state: "preview" };
        const responseText = ensureEvidenceBlocks(
          formatSupplierPreview(parsed),
          "LLM web search",
          defaultSupplierLimitation
        );

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
            itemsCount: parsed.items.length,
          },
          cost_estimate: null,
        });

        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message: responseText,
            response: responseText,
            suggested_chips: [
              {
                id: "confirm-full",
                label: "Запустить полный анализ",
                action: "insert",
                payload: "Запустить полный анализ",
              },
            ],
            ui_hints: uiHints,
            tool_calls: [
              {
                name: "supplier_search_preview",
                args: { query: lastUserMessage },
                result: { itemsCount: parsed.items.length },
              },
            ],
            entities: { query: lastUserMessage, suppliers: parsed.items.map((item) => item.name) },
            summary: buildSummary(responseText),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: balanceData, error: balanceError } = await supabaseAdmin.rpc(
        "tc_get_balance",
        { p_user_id: userData.user?.id ?? null }
      );
      const balanceRow =
        Array.isArray(balanceData) && balanceData.length > 0 ? balanceData[0] : null;
      const balanceTotal = Number(balanceRow?.balance_total ?? 0);
      if (balanceError || balanceTotal < 500) {
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message:
              "Для полного анализа нужно 500 TC. Пополните баланс, чтобы продолжить.",
            response:
              "Для полного анализа нужно 500 TC. Пополните баланс, чтобы продолжить.",
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
                args: { query: lastUserMessage },
                result: { blocked: true, reason: "insufficient_tc" },
              },
            ],
            entities: { query: lastUserMessage },
            summary: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      uiHints = { ...uiHints, show_paywall: true, progress_state: "analysis" };
      const { data: order } = await supabaseAdmin
        .from("orders")
        .insert({
          user_id: userData.user?.id ?? null,
          product_type: "p3",
          status: "processing",
          price: 5,
          currency: "USD",
        })
        .select("id")
        .single();

      const debitRef = order?.id ?? `p3:${session_id ?? Date.now()}`;
      const { data: debitData, error: debitError } = await supabaseAdmin.rpc(
        "tc_apply_debit",
        {
          p_user_id: userData.user?.id ?? null,
          p_amount: 500,
          p_reason: "P3 full analysis",
          p_ref_id: debitRef,
        }
      );
      const debitRow =
        Array.isArray(debitData) && debitData.length > 0 ? debitData[0] : null;
      if (debitError || !debitRow?.success) {
        if (order?.id) {
          await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", order.id);
        }
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message:
              "Не удалось списать Trade Credits. Проверьте баланс и повторите попытку.",
            response:
              "Не удалось списать Trade Credits. Проверьте баланс и повторите попытку.",
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
                args: { query: lastUserMessage },
                result: { blocked: true, reason: "debit_failed" },
              },
            ],
            entities: { query: lastUserMessage },
            summary: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, parsed } = await runSupplierSearch("full");
      const usage = data?.usage ?? null;

      if (!parsed) {
        await supabaseAdmin.from("api_usage").insert({
          provider: "openai",
          user_id: userData.user?.id ?? null,
          request_meta: {
            mode,
            stage: "full",
            page_context,
            session_id,
            model: basePayload.model,
            error: "parse_failed",
          },
          cost_estimate: null,
        });
        await refundTc(debitRef, "refund_p3_parse_error");
        if (order?.id) {
          await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", order.id);
        }
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message:
              "Полный анализ не удалось сформировать. Попробуйте уточнить запрос и повторить.",
            response:
              "Полный анализ не удалось сформировать. Попробуйте уточнить запрос и повторить.",
            suggested_chips: [],
            ui_hints: { progress_state: "preview" },
            tool_calls: [
              {
                name: "supplier_search_full",
                args: { query: lastUserMessage },
                result: null,
              },
            ],
            entities: { query: lastUserMessage },
            summary: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const responseText = ensureEvidenceBlocks(
        formatSupplierFull(parsed),
        "LLM web search",
        defaultSupplierLimitation
      );
      const { data: report } = await supabaseAdmin
        .from("reports")
        .insert({
          order_id: order?.id ?? null,
          user_id: userData.user?.id ?? null,
          product_type: "p3",
          status: "processing",
          params: { query: lastUserMessage },
        })
        .select("id")
        .single();
      if (!report?.id) {
        await refundTc(debitRef, "refund_p3_report_error");
        if (order?.id) {
          await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", order.id);
        }
        return new Response(
          JSON.stringify({
            ok: true,
            mode,
            message: "Не удалось создать отчет. Средства возвращены.",
            response: "Не удалось создать отчет. Средства возвращены.",
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
        items: parsed.items.map((item) => ({
          source: item.platform,
          title: item.name,
          price: item.price_range ?? null,
          moq: item.moq ?? null,
          location: item.location ?? null,
          url: item.link ?? null,
        })),
        query: lastUserMessage,
        source: "LLM web search",
        limitation: parsed.limitations ?? "Данные из открытых источников. Требуется проверка.",
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
          itemsCount: parsed.items.length,
          reportId: report?.id ?? null,
        },
        cost_estimate: null,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          mode,
          message: responseText,
          response: responseText,
          suggested_chips: [],
          ui_hints: uiHints,
          tool_calls: [
            {
              name: "supplier_search_full",
              args: { query: lastUserMessage, reportId: report?.id ?? null },
              result: { itemsCount: parsed.items.length },
            },
          ],
          entities: { query: lastUserMessage, suppliers: parsed.items.map((item) => item.name) },
          summary: buildSummary(responseText),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "assistant") {
      const normalized = lastUserMessage.toLowerCase();
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
    }

    const data = await runOpenAI(basePayload);
    const text =
      data.output_text ??
      data?.output?.[0]?.content?.[0]?.text ??
      "Нет ответа.";
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
        suggested_chips: suggestedChips,
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
