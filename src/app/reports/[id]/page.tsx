"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { EvidenceList } from "@/components/domain/EvidenceList";
import { Section } from "@/components/layout/Section";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fetchReportById } from "@/lib/api/reports";
import { supabaseClient } from "@/lib/supabase/client";
import type { Report } from "@/lib/types/core";

export default function ReportDetailsPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

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
              value: "Supabase demo dataset",
              note: "Будет заменено на реальный источник данных.",
            },
            {
              label: "Ограничение",
              value: "Данные носят демонстрационный характер",
            },
          ]}
        />
      </Section>
    </AppShell>
  );
}
