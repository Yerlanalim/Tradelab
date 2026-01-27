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
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

  let reportRow:
    | { id: string; user_id: string; order_id: string | null; title: string | null; result_summary: unknown }
    | null = null;
  let ownerId = userData.user?.id ?? null;

  if (!userError && ownerId) {
    const { data } = await supabaseAdmin
      .from("reports")
      .select("id,user_id,order_id,title,result_summary")
      .eq("id", payload.reportId)
      .single();
    reportRow = (data as typeof reportRow) ?? null;
  } else {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!anonKey) {
      return NextResponse.json(
        { ok: false, message: "Missing Supabase anon key" },
        { status: 500 }
      );
    }
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data, error } = await supabaseUser
      .from("reports")
      .select("id,user_id,order_id,title,result_summary")
      .eq("id", payload.reportId)
      .single();
    if (!error && data) {
      reportRow = data as typeof reportRow;
      ownerId = data.user_id;
    } else if (refreshToken) {
      const refreshed = await supabaseUser.auth.refreshSession({
        refresh_token: refreshToken,
      });
      const refreshedUser = refreshed.data?.user ?? null;
      if (!refreshedUser?.id) {
        return NextResponse.json(
          { ok: false, message: "Invalid authorization token" },
          { status: 401 }
        );
      }
      ownerId = refreshedUser.id;
      const { data: refreshedReport } = await supabaseAdmin
        .from("reports")
        .select("id,user_id,order_id,title,result_summary")
        .eq("id", payload.reportId)
        .single();
      reportRow = (refreshedReport as typeof reportRow) ?? null;
    } else {
      return NextResponse.json(
        { ok: false, message: "Invalid authorization token" },
        { status: 401 }
      );
    }
  }

  if (!reportRow || !ownerId || reportRow.user_id !== ownerId) {
    return NextResponse.json({ ok: false, message: "Access denied for report" }, { status: 403 });
  }

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
  const buffer = await generateReportPdf({
    reportId: reportRow.id,
    title: reportRow.title ?? "Отчет TradeLab",
    summary: summary?.query ?? undefined,
    meta,
    source: summary?.source ?? "LLM web search",
    limitation: summary?.limitation ?? undefined,
  });

  const pdfPath = `${ownerId}/${payload.reportId}.pdf`;
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
