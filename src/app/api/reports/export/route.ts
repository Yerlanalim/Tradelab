import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

type ExportReportRequest = {
  reportId: string;
  accessToken?: string;
  refreshToken?: string;
};

type SupplierSummaryItem = {
  platform?: string;
  name?: string;
  price_range?: string;
  moq?: string;
  location?: string;
  link?: string;
  risk_level?: string;
};

type P3ResultSummary = {
  items?: SupplierSummaryItem[];
  exportCsvPath?: string;
  exportXlsxPath?: string;
};

const buildCsv = (items: SupplierSummaryItem[]) => {
  const header = ["platform", "name", "price_range", "moq", "location", "risk_level", "link"];
  const rows = items.map((item) => [
    item.platform ?? "",
    item.name ?? "",
    item.price_range ?? "",
    item.moq ?? "",
    item.location ?? "",
    item.risk_level ?? "",
    item.link ?? "",
  ]);
  const escapeValue = (value: string) => {
    const normalized = value.replace(/"/g, '""');
    return `"${normalized}"`;
  };
  return [header, ...rows]
    .map((row) => row.map((value) => escapeValue(String(value))).join(","))
    .join("\n");
};

export async function POST(request: Request) {
  const payload = (await request.json()) as ExportReportRequest;
  if (!payload?.reportId) {
    return NextResponse.json(
      { ok: false, message: "reportId required" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, message: "Missing Supabase credentials" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const bodyToken = typeof payload?.accessToken === "string" ? payload.accessToken : null;
  const refreshToken =
    typeof payload?.refreshToken === "string" ? payload.refreshToken : null;
  const token = headerToken ?? bodyToken;
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "Missing Authorization token" },
      { status: 401 }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  
  // 1. Get user from token
  const { data: userData } = await supabaseAdmin.auth.getUser(token);
  let authenticatedUserId = userData.user?.id ?? null;

  // 2. Fallback to session refresh if needed
  if (!authenticatedUserId && refreshToken) {
    const { data: refreshData } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
    authenticatedUserId = refreshData.user?.id ?? null;
  }

  if (!authenticatedUserId) {
    return NextResponse.json({ ok: false, message: "Invalid or expired session" }, { status: 401 });
  }

  // 3. Fetch report using admin client to check ownership
  if (!isUuid(payload.reportId)) {
    console.error("[EXPORT ERROR] Invalid reportId format:", payload.reportId);
    return NextResponse.json({ ok: false, message: "Invalid reportId format" }, { status: 400 });
  }

  // Sequential check: first by id, then by order_id
  let { data: reportRow, error: reportErr } = await supabaseAdmin
    .from("reports")
    .select("id,user_id,result_summary")
    .eq("id", payload.reportId)
    .maybeSingle();

  if (!reportRow && !reportErr) {
    const { data: byOrder, error: orderErr } = await supabaseAdmin
      .from("reports")
      .select("id,user_id,result_summary")
      .eq("order_id", payload.reportId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    reportRow = byOrder;
    reportErr = orderErr;
  }

  if (reportErr) {
    console.error("[EXPORT ERROR] Database error:", reportErr);
    return NextResponse.json({ ok: false, message: "Database error" }, { status: 500 });
  }

  if (!reportRow) {
    console.error("[EXPORT ERROR] Report not found in DB:", payload.reportId);
    return NextResponse.json({ ok: false, message: "Report not found" }, { status: 404 });
  }

  if (reportRow.user_id !== authenticatedUserId) {
    return NextResponse.json({ ok: false, message: "Access denied" }, { status: 403 });
  }

  // Proceed with export...

  const summary = reportRow.result_summary as P3ResultSummary | null;
  const items = summary?.items ?? [];
  if (!items.length) {
    return NextResponse.json(
      { ok: false, message: "No items to export" },
      { status: 400 }
    );
  }

  const csv = buildCsv(items);
  const exportPath = `${authenticatedUserId}/${payload.reportId}.csv`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("exports")
    .upload(exportPath, csv, {
      contentType: "text/csv",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { ok: false, message: uploadError.message },
      { status: 500 }
    );
  }

  await supabaseAdmin
    .from("reports")
    .update({
      result_summary: { ...(summary ?? {}), exportCsvPath: exportPath },
    })
    .eq("id", payload.reportId);

  await supabaseAdmin.from("p3_events").insert({
    user_id: authenticatedUserId,
    event_type: "export_csv",
    event_meta: { report_id: payload.reportId },
  });

  return NextResponse.json({ ok: true, exportPath });
}
