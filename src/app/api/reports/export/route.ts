import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ExportReportRequest = {
  reportId: string;
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
  exportPath?: string;
};

const buildCsv = (items: SupplierSummaryItem[]) => {
  const header = ["source", "title", "price", "moq", "location", "url"];
  const rows = items.map((item) => [
    item.source ?? "",
    item.title ?? "",
    item.price ?? "",
    item.moq ?? "",
    item.location ?? "",
    item.url ?? "",
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
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "Missing Authorization token" },
      { status: 401 }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json(
      { ok: false, message: "Invalid authorization token" },
      { status: 401 }
    );
  }

  const { data: reportRow } = await supabaseAdmin
    .from("reports")
    .select("id,user_id,result_summary")
    .eq("id", payload.reportId)
    .single();

  if (!reportRow || reportRow.user_id !== userData.user.id) {
    return NextResponse.json(
      { ok: false, message: "Access denied for report" },
      { status: 403 }
    );
  }

  const summary = reportRow.result_summary as P3ResultSummary | null;
  const items = summary?.items ?? [];
  if (!items.length) {
    return NextResponse.json(
      { ok: false, message: "No items to export" },
      { status: 400 }
    );
  }

  const csv = buildCsv(items);
  const exportPath = `${userData.user.id}/${payload.reportId}.csv`;
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
      result_summary: { ...(summary ?? {}), exportPath },
    })
    .eq("id", payload.reportId);

  return NextResponse.json({ ok: true, exportPath });
}
