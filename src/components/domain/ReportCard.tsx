import Link from "next/link";

import { RiskBadge } from "@/components/domain/RiskBadge";

type ReportCardProps = {
  title: string;
  status: "ready" | "processing";
  createdAt: string;
  href: string;
  pdfAvailable?: boolean;
};

export function ReportCard({
  title,
  status,
  createdAt,
  href,
  pdfAvailable,
}: ReportCardProps) {
  const badge = status === "ready" ? "Готов" : "В процессе";
  const tone = status === "ready" ? "success" : "warning";

  return (
    <div className="ui-glass rounded-2xl p-4 text-sm text-white/80">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs ui-text-muted">{createdAt}</div>
        </div>
        <RiskBadge label={badge} tone={tone} />
      </div>
      {pdfAvailable && (
        <div className="mt-2 text-[11px] text-emerald-300">
          PDF готов
        </div>
      )}
      <Link
        className="mt-3 inline-flex text-xs font-medium text-emerald-400 underline"
        href={href}
      >
        Открыть
      </Link>
    </div>
  );
}
