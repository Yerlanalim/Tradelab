"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { ReportCard } from "@/components/domain/ReportCard";
import { Section } from "@/components/layout/Section";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { fetchReportsForUser, seedDemoReports } from "@/lib/api/reports";
import { useSupabaseAuth } from "@/lib/auth/supabaseAuth";
import type { Report } from "@/lib/types/core";

export default function ReportsPage() {
  const { user } = useSupabaseAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const loadReports = async () => {
    setStatus("loading");
    try {
      const data = await fetchReportsForUser();
      setReports(data);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReports();
  }, []);

  const totals = useMemo(() => {
    const total = reports.length;
    const ready = reports.filter((report) => report.status === "ready").length;
    const processing = reports.filter(
      (report) => report.status === "processing"
    ).length;
    return { total, ready, processing };
  }, [reports]);

  const getExportPath = (report: Report) => {
    const summary = report.resultSummary;
    if (!summary || typeof summary !== "object") return null;
    const typed = summary as { exportCsvPath?: string; exportXlsxPath?: string };
    return typed.exportCsvPath ?? typed.exportXlsxPath ?? null;
  };

  const handleSeed = async () => {
    if (!user) return;
    setMessage(null);
    try {
      await seedDemoReports(user.id);
      await loadReports();
      setMessage("Демо‑отчеты созданы.");
    } catch {
      setMessage("Не удалось создать демо‑отчеты.");
    }
  };

  return (
    <AppShell
      title="Мои отчёты"
      description="История проверок и статусы генерации."
    >
      <Section title="Сводка" description="Общий статус отчетов.">
        <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Всего отчетов" description="Данные из Supabase">
            <div className="text-3xl font-semibold text-white">
              {totals.total}
            </div>
        </Card>
        <Card title="Активные" description="Готовы к скачиванию">
            <div className="text-3xl font-semibold text-white">
              {totals.ready}
            </div>
        </Card>
        <Card title="В процессе" description="Генерация">
            <div className="text-3xl font-semibold text-white">
              {totals.processing}
            </div>
        </Card>
        </div>
      </Section>

      <Section
        title="Управление"
        description="Обновление и тестовые данные."
        className="mt-6"
      >
        <div className="flex flex-wrap items-center gap-3">
        <Button onClick={loadReports} variant="secondary">
          Обновить
        </Button>
        <Button onClick={handleSeed}>Создать демо‑отчеты</Button>
          {message && <span className="text-xs text-white/60">{message}</span>}
        </div>
      </Section>

      <Section
        title="Список отчетов"
        description="Табличный вид и быстрый просмотр."
        className="mt-6"
      >
        {status === "loading" ? (
          <div className="text-sm text-white/60">Загрузка...</div>
        ) : status === "error" ? (
          <div className="text-sm text-white/60">
            Не удалось получить отчеты.
          </div>
        ) : reports.length ? (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {reports.slice(0, 4).map((report) => (
                <ReportCard
                  key={report.id}
                  title={report.title}
                  status={report.status}
                  createdAt={report.createdAt}
                  href={`/reports/${report.id}`}
                  pdfAvailable={Boolean(report.pdfUrl)}
                />
              ))}
            </div>
            <div className="mt-4">
              <Table
                headers={["Отчет", "Статус", "PDF", "WEB", "CSV", "Дата", "Действие"]}
                rows={reports.map((report) => [
                  report.title,
                  report.status === "ready"
                    ? "Готов"
                    : report.status === "failed"
                    ? "Ошибка"
                    : report.status === "draft"
                    ? "Черновик"
                    : "В процессе",
                  report.pdfUrl ? "Есть" : "—",
                  report.webReportUrl ? "Есть" : "—",
                  getExportPath(report) ? "Есть" : "—",
                  report.createdAt,
                  <Link
                    key={report.id}
                    className="text-emerald-400 underline"
                    href={`/reports/${report.id}`}
                  >
                    Открыть
                  </Link>,
                ])}
              />
            </div>
          </>
        ) : (
          <div className="text-sm text-white/60">Отчеты пока отсутствуют.</div>
        )}
      </Section>
    </AppShell>
  );
}
