import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  description?: string;
  children: ReactNode;
};

export function Card({ title, description, children }: CardProps) {
  return (
    <section className="ui-glass rounded-2xl p-5 shadow-sm">
      {(title || description) && (
        <header className="mb-4">
          {title && <h2 className="text-base font-semibold text-white">{title}</h2>}
          {description && (
            <p className="mt-1 text-sm ui-text-muted">{description}</p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
