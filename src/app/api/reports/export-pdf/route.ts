import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { generateReportPdf } from "@/lib/pdf/reportPdf";

export const runtime = "nodejs";

type ExportReportRequest = {
  reportId: string;
  accessToken?: string;
  refreshToken?: string;
};

type P3ResultSummary = {
  query?: string;
  bench?: {
    priceRange?: string;
    moqRange?: string;
  };
  source?: string;
  limitation?: string;
  stats?: {
    totalFound?: number;
    dedupedCount?: number;
    finalCount?: number;
  };
};

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export async function POST(request: Request) {
  const payload = (await request.json()) as ExportReportRequest;
  if (!payload?.reportId) {
    return NextResponse.json({ ok: false, message: "reportId required" }, { status: 400 });
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
    console.error("[EXPORT PDF ERROR] Invalid reportId format:", payload.reportId);
    return NextResponse.json({ ok: false, message: "Invalid reportId format" }, { status: 400 });
  }

  // Sequential check: first by id, then by order_id
  let { data: reportRow, error: reportErr } = await supabaseAdmin
    .from("reports")
    .select("id,user_id,order_id,result_summary")
    .eq("id", payload.reportId)
    .maybeSingle();

  if (!reportRow && !reportErr) {
    const { data: byOrder, error: orderErr } = await supabaseAdmin
      .from("reports")
      .select("id,user_id,order_id,result_summary")
      .eq("order_id", payload.reportId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    reportRow = byOrder;
    reportErr = orderErr;
  }

  if (reportErr) {
    console.error("[EXPORT PDF ERROR] Database error:", reportErr);
    return NextResponse.json({ ok: false, message: "Database error" }, { status: 500 });
  }

  if (!reportRow) {
    console.error("[EXPORT PDF ERROR] Report not found in DB:", payload.reportId);
    return NextResponse.json({ ok: false, message: "Report not found" }, { status: 404 });
  }

  if (reportRow.user_id !== authenticatedUserId) {
    return NextResponse.json({ ok: false, message: "Access denied" }, { status: 403 });
  }

  // Proceed with export...
  const summary = reportRow.result_summary as P3ResultSummary | null;
  let jobId: string | null = null;
  if (reportRow.order_id) {
    const { data: job } = await supabaseAdmin
      .from("report_jobs")
      .insert({ order_id: reportRow.order_id, status: "running" })
      .select("id")
      .single();
    jobId = job?.id ?? null;
  }
  const meta: Record<string, string> = {
    "Цена (бенчмарк)": summary?.bench?.priceRange ?? "н/д",
    "MOQ (бенчмарк)": summary?.bench?.moqRange ?? "н/д",
  };
  if (summary?.stats) {
    meta["Проанализировано"] = summary.stats.totalFound?.toString() ?? "н/д";
    meta["После дедупа"] = summary.stats.dedupedCount?.toString() ?? "н/д";
    meta["В отчёте"] = summary.stats.finalCount?.toString() ?? "н/д";
  }
  
  console.log("[EXPORT PDF] Starting PDF generation for report:", reportRow.id);
  console.log("[EXPORT PDF] Summary:", JSON.stringify(summary, null, 2));
  console.log("[EXPORT PDF] Items count:", (summary as any)?.items?.length ?? 0);
  
  let buffer;
  try {
    buffer = await generateReportPdf({
      reportId: reportRow.id,
      title: (summary as any)?.title || "Отчет TradeLab",
      summary: summary?.query ?? undefined,
      items: (summary as any)?.items ?? [],
      meta,
      source: summary?.source ?? "LLM web search",
      limitation: summary?.limitation ?? undefined,
    });
    console.log("[EXPORT PDF] PDF generated successfully, buffer size:", buffer.length);
  } catch (pdfError: any) {
    console.error("[EXPORT PDF] PDF generation failed:", pdfError);
    console.error("[EXPORT PDF] Error stack:", pdfError.stack);
    if (jobId) {
      await supabaseAdmin.from("report_jobs").update({ status: "failed" }).eq("id", jobId);
    }
    return NextResponse.json({ ok: false, message: `PDF generation error: ${pdfError.message}` }, { status: 500 });
  }

  const pdfPath = `${authenticatedUserId}/${payload.reportId}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage.from("reports").upload(pdfPath, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (uploadError) {
    if (jobId) {
      await supabaseAdmin.from("report_jobs").update({ status: "failed" }).eq("id", jobId);
    }
    return NextResponse.json({ ok: false, message: uploadError.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("reports")
    .update({ pdf_url: pdfPath })
    .eq("id", payload.reportId);

  if (jobId) {
    await supabaseAdmin.from("report_jobs").update({ status: "done" }).eq("id", jobId);
  }

  return NextResponse.json({ ok: true, pdfPath, jobId });
}
