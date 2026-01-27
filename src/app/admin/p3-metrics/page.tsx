"use client";

import { useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { supabaseClient } from "@/lib/supabase/client";

type MetricsPayload = {
  ok: boolean;
  range_days?: number;
  total?: number;
  counts?: Record<string, number>;
  errors?: Record<string, number>;
  message?: string;
};

export default function AdminP3MetricsPage() {
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const loadMetrics = async () => {
    setStatus("loading");
    try {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        setStatus("error");
        setMetrics({ ok: false, message: "Требуется вход." });
        return;
      }
      const response = await fetch("/api/admin/p3-metrics?days=30", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as MetricsPayload;
      setMetrics(payload);
      setStatus(response.ok && payload.ok ? "idle" : "error");
    } catch (error) {
      setStatus("error");
      setMetrics({ ok: false, message: error instanceof Error ? error.message : "Ошибка." });
    }
  };

  useEffect(() => {
    const loadAccess = async () => {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        setIsAllowed(false);
        return;
      }
      const response = await fetch("/api/admin/access", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as { ok: boolean; is_admin?: boolean };
      setIsAllowed(Boolean(payload.ok && payload.is_admin));
    };
    loadAccess();
  }, []);

  useEffect(() => {
    if (isAllowed) {
      loadMetrics();
    }
  }, [isAllowed]);

  if (isAllowed === false) {
    return (
      <AppShell title="Admin: P3 Metrics" description="Доступ ограничен.">
        <Section title="Доступ" description="Требуются права admin.">
          <Card title="Нет доступа" description="Свяжитесь с администратором.">
            <div className="text-sm text-white/70">Доступ запрещен.</div>
          </Card>
        </Section>
      </AppShell>
    );
  }

  if (isAllowed === null) {
    return (
      <AppShell title="Admin: P3 Metrics" description="Проверка доступа.">
        <Section title="Проверка" description="Проверяем права доступа.">
          <Card title="Пожалуйста, подождите" description="Загрузка...">
            <div className="text-sm text-white/70">Загрузка...</div>
          </Card>
        </Section>
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin: P3 Metrics" description="Воронка и ошибки по продукту 3.">
      <Section title="Сводка" description="За последние 30 дней.">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Событий всего" description="p3_events">
            <div className="text-3xl font-semibold text-white">
              {metrics?.total ?? "—"}
            </div>
          </Card>
          <Card title="Preview" description="preview">
            <div className="text-3xl font-semibold text-white">
              {metrics?.counts?.preview ?? 0}
            </div>
          </Card>
          <Card title="Full" description="full">
            <div className="text-3xl font-semibold text-white">
              {metrics?.counts?.full ?? 0}
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Воронка" description="Confirm, export, RFQ." className="mt-6">
        <div className="grid gap-6 lg:grid-cols-4">
          <Card title="Confirm full" description="confirm_full">
            <div className="text-3xl font-semibold text-white">
              {metrics?.counts?.confirm_full ?? 0}
            </div>
          </Card>
          <Card title="Export CSV" description="export_csv">
            <div className="text-3xl font-semibold text-white">
              {metrics?.counts?.export_csv ?? 0}
            </div>
          </Card>
          <Card title="Export XLSX" description="export_xlsx">
            <div className="text-3xl font-semibold text-white">
              {metrics?.counts?.export_xlsx ?? 0}
            </div>
          </Card>
          <Card title="RFQ" description="rfq">
            <div className="text-3xl font-semibold text-white">
              {metrics?.counts?.rfq ?? 0}
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Ошибки" description="Коды ошибок P3." className="mt-6">
        <Card title="Ошибки" description="Разбивка по error code">
          {status === "loading" ? (
            <div className="text-sm text-white/70">Загрузка...</div>
          ) : status === "error" ? (
            <div className="text-sm text-white/70">
              {metrics?.message ?? "Не удалось загрузить метрики."}
            </div>
          ) : (
            <div className="space-y-2 text-sm text-white/70">
              {metrics?.errors && Object.keys(metrics.errors).length > 0 ? (
                Object.entries(metrics.errors).map(([code, value]) => (
                  <div key={code} className="flex items-center justify-between">
                    <span>{code}</span>
                    <span>{value}</span>
                  </div>
                ))
              ) : (
                <div>Ошибок нет.</div>
              )}
            </div>
          )}
          <div className="mt-4">
            <Button variant="secondary" onClick={loadMetrics}>
              Обновить
            </Button>
          </div>
        </Card>
      </Section>
    </AppShell>
  );
}
