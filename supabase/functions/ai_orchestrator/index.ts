import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sectionPrompts: Record<string, string> = {
  p1:
    "Ты помощник по проверке компании (QCC). Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  p2:
    "Ты помощник по экспортному профилю (Tendata). Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  p3:
    "Ты помощник по поиску поставщиков (Apify). Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  p4:
    "Ты помощник по анализу рынка поставок (KZ). Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  map:
    "Ты помощник по карте производителей. Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  library:
    "Ты помощник по библиотеке материалов. Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  zones:
    "Ты помощник по торговым зонам и хабам Китая. Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  exhibitions:
    "Ты помощник по выставкам в Китае. Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  reports:
    "Ты помощник по отчетам TradeLab. Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  settings:
    "Ты помощник по настройкам аккаунта TradeLab. Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  dashboard:
    "Ты помощник по главному разделу TradeLab. Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...».",
  calculator:
    "Ты помощник по расчету landed cost. Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...». " +
    "Если данных нет, явно укажи, что ответ предположительный.",
  general:
    "Ты ассистент TradeLab. Отвечай кратко и структурированно. " +
    "В конце ответа добавляй блоки: «Источник: ...» и «Ограничение: ...».",
};

const contentTypeBySection: Record<string, string> = {
  map: "map",
  library: "library",
  zones: "zone",
  exhibitions: "exhibition",
};

const normalizeText = (value: string | null | undefined, max = 360) => {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
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

  let payloadData: { messages?: unknown; section?: string; context?: unknown };
  try {
    payloadData = await req.json();
  } catch (_error) {
    return new Response(JSON.stringify({ ok: false, message: "Invalid JSON payload" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const { messages = [], section = "general", context } = payloadData ?? {};
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

  let sectionContext = "";
  const contentType = contentTypeBySection[section];
  if (supabaseAdmin && contentType) {
    const { data } = await supabaseAdmin
      .from("content_items")
      .select("title, body")
      .eq("type", contentType)
      .order("created_at", { ascending: false })
      .limit(3);
    if (data && data.length > 0) {
      const items = data
        .map((item) => `- ${item.title}: ${normalizeText(item.body)}`)
        .join("\n");
      sectionContext = `Контекст раздела:\n${items}`;
    }
  }

  let userContext = "";
  if (context) {
    userContext =
      typeof context === "string"
        ? `Контекст пользователя:\n${normalizeText(context, 500)}`
        : `Контекст пользователя (json):\n${normalizeText(JSON.stringify(context), 500)}`;
  }

  const systemPrompt = [
    sectionPrompts[section] ?? sectionPrompts.general,
    sectionContext,
    userContext,
  ]
    .filter(Boolean)
    .join("\n\n");

  const payload = {
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(messages) ? messages : []),
    ],
    temperature: 0.3,
  };

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
    return new Response(JSON.stringify({ ok: false, message: "AI service unavailable" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 502,
    });
  }

  const data = await response.json();
  const text =
    data.output_text ??
    data?.output?.[0]?.content?.[0]?.text ??
    "Нет ответа.";
  const usage = data?.usage ?? null;

  await supabaseAdmin.from("api_usage").insert({
    provider: "openai",
    user_id: userData.user?.id ?? null,
    request_meta: { section, model: payload.model, usage },
    cost_estimate: null,
  });

  return new Response(JSON.stringify({ ok: true, message: text }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
