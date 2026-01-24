import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type GrantPayload = {
  user_id: string;
  amount: number;
  credit_type: "bonus" | "promo" | "welcome" | "purchased";
  reason?: string;
  expires_at?: string | null;
  ref_id?: string | null;
};

const parseAdminEmails = (value: string | undefined) => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmails = parseAdminEmails(Deno.env.get("ADMIN_EMAILS"));
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, message: "Missing Supabase admin config" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
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

  const email = (userData.user.email ?? "").toLowerCase();
  if (!adminEmails.includes(email)) {
    return new Response(JSON.stringify({ ok: false, message: "Forbidden" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 403,
    });
  }

  let payload: GrantPayload;
  try {
    payload = (await req.json()) as GrantPayload;
  } catch {
    return new Response(JSON.stringify({ ok: false, message: "Invalid JSON payload" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const { user_id, amount, credit_type, reason, expires_at, ref_id } = payload ?? {};
  if (!user_id || !amount || amount <= 0) {
    return new Response(JSON.stringify({ ok: false, message: "Invalid payload" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const { data, error } = await supabaseAdmin.rpc("tc_apply_credit", {
    p_user_id: user_id,
    p_amount: amount,
    p_credit_type: credit_type,
    p_reason: reason ?? "admin grant",
    p_expires_at: expires_at ?? null,
    p_ref_id: ref_id ?? `admin:${Date.now()}`,
  });

  if (error) {
    return new Response(JSON.stringify({ ok: false, message: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return new Response(
    JSON.stringify({ ok: true, balance_total: row?.balance_total ?? null, message: row?.message }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
