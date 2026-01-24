import { supabaseClient } from "@/lib/supabase/client";
import type { Report } from "@/lib/types/core";

type SupabaseReportRow = {
  id: string;
  order_id: string;
  product_type: string;
  status: string;
  result_summary: unknown;
  created_at: string;
  pdf_url: string | null;
  web_report_url: string | null;
};

const mapReport = (row: SupabaseReportRow): Report => {
  const summaryObject =
    row.result_summary && typeof row.result_summary === "object"
      ? (row.result_summary as Record<string, unknown>)
      : undefined;
  const title =
    typeof summaryObject?.title === "string"
      ? summaryObject.title
      : row.result_summary
      ? "Отчет готов"
      : "Отчет";
  const summary =
    typeof summaryObject?.summary === "string"
      ? summaryObject.summary
      : typeof row.result_summary === "string"
      ? row.result_summary
      : row.result_summary
      ? JSON.stringify(row.result_summary)
      : "";

  return {
    id: row.id,
    orderId: row.order_id,
    productType: row.product_type as Report["productType"],
    title,
    status: row.status as Report["status"],
    summary,
    createdAt: row.created_at,
    pdfUrl: row.pdf_url ?? undefined,
    webReportUrl: row.web_report_url ?? undefined,
    resultSummary: summaryObject,
  };
};

export async function fetchReportsForUser(): Promise<Report[]> {
  const { data, error } = await supabaseClient
    .from("reports")
    .select("id,order_id,product_type,status,result_summary,created_at,pdf_url,web_report_url")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapReport);
}

export async function fetchReportById(id: string): Promise<Report | null> {
  const { data, error } = await supabaseClient
    .from("reports")
    .select("id,order_id,product_type,status,result_summary,created_at,pdf_url,web_report_url")
    .eq("id", id)
    .single();

  if (error) {
    return null;
  }

  return data ? mapReport(data) : null;
}

export async function seedDemoReports(userId: string) {
  const { data: orders, error: orderError } = await supabaseClient
    .from("orders")
    .insert([
      {
        user_id: userId,
        product_type: "p2",
        status: "done",
        price: 20,
        currency: "USD",
        payment_status: "paid",
      },
      {
        user_id: userId,
        product_type: "p1",
        status: "done",
        price: 20,
        currency: "USD",
        payment_status: "paid",
      },
    ])
    .select("id");

  if (orderError || !orders?.length) {
    throw new Error(orderError?.message ?? "Не удалось создать заказы.");
  }

  const { error: reportError } = await supabaseClient.from("reports").insert([
    {
      order_id: orders[0].id,
      user_id: userId,
      product_type: "p2",
      status: "ready",
      result_summary: { note: "Экспорт активен, релевантность средняя." },
    },
    {
      order_id: orders[1].id,
      user_id: userId,
      product_type: "p1",
      status: "ready",
      result_summary: { note: "Компания активна, риски низкие." },
    },
  ]);

  if (reportError) {
    throw new Error(reportError.message);
  }
}
