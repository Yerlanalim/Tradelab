import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const baseStyles =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-linear-to-r from-[#10B981] to-[#059669] text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50",
  secondary:
    "bg-white/10 text-white border border-white/20 hover:bg-white/20 backdrop-blur-sm",
  ghost: "bg-transparent text-white/60 hover:bg-white/10",
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={[baseStyles, variantStyles[variant], className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
