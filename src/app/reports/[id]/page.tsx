"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { EvidenceList } from "@/components/domain/EvidenceList";
import { PriceBench } from "@/components/domain/PriceBench";
import { SupplierRow } from "@/components/domain/SupplierRow";
import { Section } from "@/components/layout/Section";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fetchReportById } from "@/lib/api/reports";
import { supabaseClient } from "@/lib/supabase/client";
import type { Report } from "@/lib/types/core";

type SupplierSummaryItem = {
  source: string;
  title?: string;
  price?: string;
  moq?: string;
  location?: string;
  url?: string;
};

type P3ResultSummary = {
  query?: string;
  itemsCount?: number;
  bench?: {
    priceRange?: string;
    moqRange?: string;
  };
  items?: SupplierSummaryItem[];
  exportPath?: string;
};

export default function ReportDetailsPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const p3Summary =
    report?.productType === "p3"
      ? (report.resultSummary as P3ResultSummary | undefined)
      : undefined;
  const sourceLabel =
    typeof (report?.resultSummary as { source?: unknown } | undefined)?.source === "string"
      ? ((report?.resultSummary as { source?: string }).source as string)
      : "Supabase demo dataset";
  const limitationLabel =
    typeof (report?.resultSummary as { limitation?: unknown } | undefined)?.limitation === "string"
      ? ((report?.resultSummary as { limitation?: string }).limitation as string)
      : "Данные носят демонстрационный характер";

  useEffect(() => {
    const load = async () => {
      setStatus("loading");
      const data = await fetchReportById(params.id);
      setReport(data);
      setStatus(data ? "idle" : "error");
    };
    load();
  }, [params.id]);

  useEffect(() => {
    const loadUrl = async () => {
      if (!report?.pdfUrl) {
        setDownloadUrl(null);
        return;
      }
      const { data } = await supabaseClient.storage
        .from("reports")
        .createSignedUrl(report.pdfUrl, 60 * 60);
      setDownloadUrl(data?.signedUrl ?? null);
    };
    loadUrl();
  }, [report?.pdfUrl]);

  useEffect(() => {
    const loadExportUrl = async () => {
      if (!p3Summary?.exportPath) {
        setExportUrl(null);
        return;
      }
      const { data } = await supabaseClient.storage
        .from("exports")
        .createSignedUrl(p3Summary.exportPath, 60 * 60);
      setExportUrl(data?.signedUrl ?? null);
    };
    loadExportUrl();
  }, [p3Summary?.exportPath]);

  const handleExport = async () => {
    if (!report?.id) return;
    setIsExporting(true);
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/reports/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reportId: report.id }),
      });
      const data = await response.json();
      if (response.ok && data.ok && data.exportPath) {
        setReport((prev) =>
          prev
            ? {
                ...prev,
                resultSummary: {
                  ...(p3Summary ?? {}),
                  exportPath: data.exportPath,
                },
              }
            : prev
        );
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AppShell
      title="Отчет"
      description="Сводка, доказательства и действия."
    >
      <Section title="Сводка" description="Основные параметры отчета.">
        <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Сводка" description="Данные из Supabase">
          {status === "loading" ? (
            <div className="text-sm text-white/60">Загрузка...</div>
          ) : report ? (
            <div className="space-y-2 text-sm text-white/70">
              <div>Название: {report.title}</div>
              <div>Статус: {report.status === "ready" ? "Готов" : "В процессе"}</div>
              <div>Дата: {report.createdAt}</div>
              {p3Summary?.query && <div>Запрос: {p3Summary.query}</div>}
            </div>
          ) : (
            <div className="text-sm text-white/60">Отчет не найден.</div>
          )}
        </Card>
        <Card title="Файл" description="PDF в Supabase Storage">
          <div className="space-y-3">
            <div className="rounded-lg border border-dashed border-white/20 p-4 text-xs text-white/60">
              {downloadUrl ? "PDF готов к скачиванию" : "PDF будет доступен после генерации"}
            </div>
            <div className="flex flex-wrap gap-2">
              {downloadUrl ? (
                <a
                  className="inline-flex"
                  href={downloadUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Button variant="secondary">Скачать PDF</Button>
                </a>
              ) : (
                <Button variant="secondary" disabled>
                  Скачать PDF
                </Button>
              )}
              {report?.productType === "p3" && (
                exportUrl ? (
                  <a
                    className="inline-flex"
                    href={exportUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Button variant="secondary">Скачать CSV</Button>
                  </a>
                ) : (
                  <Button variant="secondary" onClick={handleExport} disabled={isExporting}>
                    {isExporting ? "Генерация..." : "Сформировать CSV"}
                  </Button>
                )
              )}
            </div>
          </div>
        </Card>
        <Card title="Действия" description="Навигация">
          <div className="flex flex-col gap-2">
            <Button>Повторить отчет</Button>
            <Link
              className="text-sm text-emerald-400 underline"
              href="/reports"
            >
              Назад к списку
            </Link>
          </div>
        </Card>
        </div>
      </Section>

      {report?.productType === "p3" && p3Summary && (
        <Section
          title="Отчет поиска поставщиков"
          description="Список и бенчмарки по результатам поиска."
          className="mt-6"
        >
          {p3Summary.bench?.priceRange && (
            <PriceBench
              priceRange={p3Summary.bench.priceRange}
              moqRange={p3Summary.bench.moqRange ?? undefined}
            />
          )}
          {p3Summary.items && p3Summary.items.length > 0 && (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {p3Summary.items.map((item, index) => (
                <SupplierRow
                  key={`${item.source}-${index}`}
                  source={item.source}
                  title={item.title ?? "Без названия"}
                  price={item.price}
                  moq={item.moq}
                  location={item.location}
                  url={item.url}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      <Section
        title="Доказательства"
        description="Факторы, которые повлияли на вывод."
        className="mt-6"
      >
        <EvidenceList
          title="Источник и ограничения"
          items={[
            {
              label: "Источник",
              value: sourceLabel,
              note:
                sourceLabel === "Supabase demo dataset"
                  ? "Будет заменено на реальный источник данных."
                  : undefined,
            },
            {
              label: "Ограничение",
              value: limitationLabel,
            },
          ]}
        />
      </Section>
    </AppShell>
  );
}
