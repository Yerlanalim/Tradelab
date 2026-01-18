import { supabaseClient } from "@/lib/supabase/client";
import type { ProductType } from "@/lib/types/core";

type ReportFlowInput = {
  userId: string;
  productType: ProductType;
  price: number;
  title: string;
  summary: string;
  params: Record<string, string>;
  meta?: Record<string, string>;
  source?: string;
  limitation?: string;
};

type ReportFlowResult = {
  ok: boolean;
  message?: string;
  reportId?: string;
};

export async function runReportFlow({
  userId,
  productType,
  price,
  title,
  summary,
  params,
  meta,
  source,
  limitation,
}: ReportFlowInput): Promise<ReportFlowResult> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, message: "Нет активной сессии." };
  }

  const { data: order } = await supabaseClient
    .from("orders")
    .insert({
      user_id: userId,
      product_type: productType,
      status: "processing",
      price,
      currency: "USD",
    })
    .select("id")
    .single();

  if (!order?.id) {
    return { ok: false, message: "Не удалось создать заказ." };
  }

  const { data: report } = await supabaseClient
    .from("reports")
    .insert({
      order_id: order.id,
      user_id: userId,
      product_type: productType,
      status: "processing",
      params,
    })
    .select("id")
    .single();

  if (!report?.id) {
    await supabaseClient.from("orders").update({ status: "failed" }).eq("id", order.id);
    return { ok: false, message: "Не удалось создать отчет." };
  }

  const response = await fetch("/api/reports/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      reportId: report.id,
      title,
      summary,
      meta,
      source,
      limitation,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    await supabaseClient.from("orders").update({ status: "failed" }).eq("id", order.id);
    await supabaseClient.from("reports").update({ status: "failed" }).eq("id", report.id);
    return { ok: false, message: data.message ?? "Не удалось сгенерировать PDF." };
  }

  await supabaseClient.functions.invoke("report_generator", {
    body: {
      reportId: report.id,
      summary: data.summary,
      pdfUrl: data.pdfPath,
      orderId: order.id,
    },
  });

  await supabaseClient.from("orders").update({ status: "done" }).eq("id", order.id);

  return { ok: true, reportId: report.id };
}
