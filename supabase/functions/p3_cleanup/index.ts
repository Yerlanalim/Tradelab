import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const buildExportPaths = (userId: string, reportId: string) => [
  `${userId}/${reportId}.csv`,
  `${userId}/${reportId}.xlsx`,
];

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
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, message: "Missing Supabase credentials" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const cleanupSecret = Deno.env.get("CLEANUP_SECRET");
  if (cleanupSecret) {
    const provided = req.headers.get("x-cleanup-key");
    if (provided !== cleanupSecret) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date().toISOString();
  const { data: expiredReports, error } = await supabaseAdmin
    .from("reports")
    .select("id,user_id,pdf_url,result_summary")
    .eq("product_type", "p3")
    .is("archived_at", null)
    .lt("expires_at", now);

  if (error) {
    return new Response(JSON.stringify({ ok: false, message: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const reports = expiredReports ?? [];
  for (const report of reports) {
    const pdfPath = report.pdf_url ? [report.pdf_url] : [];
    const exportPaths: string[] = [];
    if (typeof report.result_summary?.exportCsvPath === "string") {
      exportPaths.push(report.result_summary.exportCsvPath);
    }
    if (typeof report.result_summary?.exportXlsxPath === "string") {
      exportPaths.push(report.result_summary.exportXlsxPath);
    }
    const fallbackExports = buildExportPaths(report.user_id, report.id);

    if (pdfPath.length > 0) {
      await supabaseAdmin.storage.from("reports").remove(pdfPath);
    }
    await supabaseAdmin.storage.from("exports").remove([...exportPaths, ...fallbackExports]);

    await supabaseAdmin
      .from("reports")
      .update({ archived_at: now })
      .eq("id", report.id);

    await supabaseAdmin
      .from("supplier_reports")
      .delete()
      .eq("report_id", report.id);
  }

  return new Response(JSON.stringify({ ok: true, archived: reports.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
