import type { ReactNode } from "react";

type SectionProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: SectionProps) {
  return (
    <section className={["space-y-4", className].filter(Boolean).join(" ")}>
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-[var(--tl-text-inverse)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-xs text-[var(--tl-text-inverse-weak)]">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
