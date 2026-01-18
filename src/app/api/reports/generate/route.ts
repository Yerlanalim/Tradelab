import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { generateReportPdf } from "@/lib/pdf/reportPdf";

export const runtime = "nodejs";

type GenerateReportRequest = {
  reportId: string;
  title: string;
  summary?: string;
  productType?: string;
  meta?: Record<string, string>;
  source?: string;
  limitation?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as GenerateReportRequest;
  if (!payload?.reportId || !payload?.title) {
    return NextResponse.json(
      { ok: false, message: "reportId and title required" },
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
    .select("id,user_id,order_id")
    .eq("id", payload.reportId)
    .single();

  if (!reportRow || reportRow.user_id !== userData.user.id) {
    return NextResponse.json(
      { ok: false, message: "Access denied for report" },
      { status: 403 }
    );
  }

  if (reportRow.order_id) {
    const { data: existingJob } = await supabaseAdmin
      .from("report_jobs")
      .select("id")
      .eq("order_id", reportRow.order_id)
      .maybeSingle();

    if (!existingJob) {
      await supabaseAdmin.from("report_jobs").insert({
        order_id: reportRow.order_id,
        status: "queued",
      });
    }
  }

  const buffer = await generateReportPdf({
    reportId: payload.reportId,
    title: payload.title,
    summary: payload.summary,
    meta: payload.meta,
    source: payload.source,
    limitation: payload.limitation,
  });

  const storagePath = `${userData.user.id}/${payload.reportId}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("reports")
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    if (reportRow.order_id) {
      await supabaseAdmin
        .from("report_jobs")
        .update({ status: "failed", last_error: uploadError.message })
        .eq("order_id", reportRow.order_id);
    }
    return NextResponse.json(
      { ok: false, message: uploadError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    pdfPath: storagePath,
    summary: payload.summary ?? "",
  });
}
