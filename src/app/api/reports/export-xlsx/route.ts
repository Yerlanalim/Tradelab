import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

type ExportReportRequest = {
  reportId: string;
  accessToken?: string;
  refreshToken?: string;
};

type SupplierSummaryItem = {
  source?: string;
  title?: string;
  price?: string;
  moq?: string;
  location?: string;
  url?: string;
};

type P3ResultSummary = {
  items?: SupplierSummaryItem[];
  exportCsvPath?: string;
  exportXlsxPath?: string;
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
    | { id: string; user_id: string; order_id: string | null; result_summary: unknown }
    | null = null;
  let ownerId = userData.user?.id ?? null;

  if (!userError && ownerId) {
    const { data } = await supabaseAdmin
      .from("reports")
      .select("id,user_id,order_id,result_summary")
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
      .select("id,user_id,order_id,result_summary")
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
        .select("id,user_id,order_id,result_summary")
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
  const items = summary?.items ?? [];
  if (!items.length) {
    return NextResponse.json({ ok: false, message: "No items to export" }, { status: 400 });
  }

  const workbook = XLSX.utils.book_new();
  const stats = summary?.stats ?? null;
  const summarySheet = XLSX.utils.json_to_sheet([
    { metric: "Проанализировано", value: stats?.totalFound ?? "" },
    { metric: "После дедупа", value: stats?.dedupedCount ?? "" },
    { metric: "В отчёте", value: stats?.finalCount ?? "" },
  ]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const suppliersSheet = XLSX.utils.json_to_sheet(
    items.map((item) => ({
      source: item.source ?? "",
      title: item.title ?? "",
      price: item.price ?? "",
      moq: item.moq ?? "",
      location: item.location ?? "",
      url: item.url ?? "",
    }))
  );
  XLSX.utils.book_append_sheet(workbook, suppliersSheet, "Suppliers");
  const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const exportPath = `${ownerId}/${payload.reportId}.xlsx`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("exports")
    .upload(exportPath, xlsxBuffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
    .update({
      result_summary: { ...(summary ?? {}), exportXlsxPath: exportPath },
    })
    .eq("id", payload.reportId);

  await supabaseAdmin.from("p3_events").insert({
    user_id: ownerId,
    event_type: "export_xlsx",
    event_meta: { report_id: payload.reportId },
  });

  if (jobId) {
    await supabaseAdmin.from("report_jobs").update({ status: "done" }).eq("id", jobId);
  }

  return NextResponse.json({ ok: true, exportPath, jobId });
}
