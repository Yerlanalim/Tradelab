import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApifyResult = {
  source: string;
  title?: string;
  price?: string;
  url?: string;
  moq?: string;
  location?: string;
  raw: Record<string, unknown>;
};

const ACTORS = {
  alibaba: "piotrv1001/alibaba-listings-scraper",
  mic: "agenscrape/made-in-china-com-product-scraper",
};

async function runActor(actorId: string, input: Record<string, unknown>, token: string) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Apify error: ${response.status}`);
  }
  return response.json();
}

function normalizeAlibaba(items: Record<string, unknown>[]): ApifyResult[] {
  return items.map((item) => ({
    source: "alibaba",
    title: String(item.title ?? item.productTitle ?? "Alibaba item"),
    price: item.price ? String(item.price) : undefined,
    url: item.url ? String(item.url) : undefined,
    moq: item.moq ? String(item.moq) : undefined,
    location: item.location ? String(item.location) : undefined,
    raw: item,
  }));
}

function normalizeMic(items: Record<string, unknown>[]): ApifyResult[] {
  return items.map((item) => ({
    source: "made-in-china",
    title: String(item.title ?? item.productName ?? "MIC item"),
    price: item.price ? String(item.price) : undefined,
    url: item.url ? String(item.url) : undefined,
    moq: item.moq ? String(item.moq) : undefined,
    location: item.location ? String(item.location) : undefined,
    raw: item,
  }));
}

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

  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ ok: false, message: "Missing APIFY_TOKEN" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const { query, limit = 20 } = await req.json();
  if (!query || typeof query !== "string") {
    return new Response(JSON.stringify({ ok: false, message: "Query is required" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const stage = Deno.env.get("TRADLAB_STAGE") ?? "dev";
  const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 20;
  const safeLimit = stage === "prod" ? parsedLimit : Math.min(parsedLimit, 20);

  const alibabaInput = { search: query, limit: safeLimit };
  const micInput = { searchMode: "keyword", keyword: query, maxResults: safeLimit };

  try {
    const [alibabaRaw, micRaw] = await Promise.all([
      runActor(ACTORS.alibaba, alibabaInput, token),
      runActor(ACTORS.mic, micInput, token),
    ]);

    const alibabaItems = Array.isArray(alibabaRaw) ? alibabaRaw : [];
    const micItems = Array.isArray(micRaw) ? micRaw : [];

    const items = [
      ...normalizeAlibaba(alibabaItems as Record<string, unknown>[]),
      ...normalizeMic(micItems as Record<string, unknown>[]),
    ];

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const { data: userData } = token
        ? await supabaseAdmin.auth.getUser(token)
        : { data: { user: null } };
      await supabaseAdmin.from("api_usage").insert({
        provider: "apify",
        user_id: userData.user?.id ?? null,
        request_meta: { query, limit: safeLimit, itemsCount: items.length },
        cost_estimate: null,
      });
    }

    return new Response(JSON.stringify({ ok: true, items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, message: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
