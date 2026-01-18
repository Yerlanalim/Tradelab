type RiskBadgeProps = {
  label: string;
  tone?: "success" | "warning" | "error" | "info" | "neutral";
};

const toneClasses: Record<Required<RiskBadgeProps>["tone"], string> = {
  success: "bg-[var(--tl-success)] text-white",
  warning: "bg-[var(--tl-warning)] text-white",
  error: "bg-[var(--tl-error)] text-white",
  info: "bg-[var(--tl-info)] text-white",
  neutral: "bg-[var(--tl-border-subtle)] text-[var(--tl-text-strong)]",
};

export function RiskBadge({ label, tone = "neutral" }: RiskBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
