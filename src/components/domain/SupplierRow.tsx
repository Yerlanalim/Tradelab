import Link from "next/link";

import { RiskBadge } from "@/components/domain/RiskBadge";

type SupplierRowProps = {
  source?: string;
  title: string;
  price?: string | null;
  moq?: string | null;
  location?: string | null;
  url?: string | null;
  badges?: string[];
  metrics?: string[];
  experience?: string | null;
  risk?: {
    label: string;
    tone: "success" | "warning" | "error" | "neutral";
    note?: string;
  };
};

export function SupplierRow({
  source,
  title,
  price,
  moq,
  location,
  url,
  badges = [],
  metrics = [],
  experience,
  risk,
}: SupplierRowProps) {
  return (
    <div className="ui-glass rounded-2xl p-4 text-sm text-white/80">
      <div className="flex items-start justify-between gap-3">
        <div>
          {source && (
            <div className="text-xs uppercase ui-text-subtle">{source}</div>
          )}
          <div className="mt-1 font-semibold text-white">{title}</div>
        </div>
        {risk && <RiskBadge label={risk.label} tone={risk.tone} />}
      </div>
      <div className="mt-2 space-y-1 text-sm ui-text-muted">
        {price && <div>Цена: {price}</div>}
        {moq && <div>MOQ: {moq}</div>}
        {location && <div>Локация: {location}</div>}
        {experience && <div>Стаж: {experience}</div>}
      </div>
      {(badges.length > 0 || metrics.length > 0) && (
        <div className="mt-3 space-y-1 text-xs text-white/60">
          {badges.length > 0 && (
            <div>Бейджи: {badges.join(", ")}</div>
          )}
          {metrics.length > 0 && (
            <div>Метрики: {metrics.join(", ")}</div>
          )}
        </div>
      )}
      {risk?.note && (
        <div className="mt-2 text-[11px] text-white/50">{risk.note}</div>
      )}
      {url && (
        <a
          className="mt-3 inline-flex text-xs font-medium text-emerald-400 underline"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          Открыть источник
        </a>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          className="text-xs font-medium text-emerald-400 underline"
          href="/products/company-check"
        >
          Проверить (P1)
        </Link>
        <Link
          className="text-xs font-medium text-emerald-400 underline"
          href="/products/export-profile"
        >
          Экспорт (P2)
        </Link>
      </div>
    </div>
  );
}
