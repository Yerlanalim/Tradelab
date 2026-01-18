import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-1 items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--tl-text-inverse)]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--tl-text-inverse-weak)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
