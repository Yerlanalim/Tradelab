"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type ConversationalField = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number";
  required?: boolean;
  hint?: string;
};

type ConversationalFormProps = {
  title: string;
  description: string;
  steps: string[];
  primaryActionLabel?: string;
  fields?: ConversationalField[];
  onSubmit?: (values: Record<string, string>) => void | Promise<void>;
};

export function ConversationalForm({
  title,
  description,
  steps,
  primaryActionLabel = "Запустить",
  fields = [],
  onSubmit,
}: ConversationalFormProps) {
  const initialValues = useMemo(() => {
    return fields.reduce<Record<string, string>>((acc, field) => {
      acc[field.name] = "";
      return acc;
    }, {});
  }, [fields]);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  const handleSubmit = async () => {
    if (!fields.length) {
      await onSubmit?.({});
      return;
    }
    const nextErrors: Record<string, string> = {};
    fields.forEach((field) => {
      if (field.required && !values[field.name]?.trim()) {
        nextErrors[field.name] = "Поле обязательно для заполнения.";
      }
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await onSubmit?.(values);
  };

  return (
    <Card title={title} description={description}>
      <div className="space-y-5">
        <div className="ui-glass-panel rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide ui-text-subtle">
            Conversational Form
          </div>
          <ol className="mt-3 space-y-2 text-sm text-white/80">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-linear-to-r from-[#10B981] to-[#059669] text-[11px] text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {fields.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((field) => (
              <label
                key={field.name}
                className="rounded-2xl border border-white/20 bg-white/5 p-4 text-xs text-white/70"
              >
                <div className="flex items-center gap-2">
                  <span>{field.label}</span>
                  {field.required && <span className="text-emerald-400">*</span>}
                </div>
                <input
                  className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/80 placeholder:text-white/40"
                  placeholder={field.placeholder}
                  type={field.type ?? "text"}
                  value={values[field.name] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      [field.name]: event.target.value,
                    }))
                  }
                />
                {field.hint && (
                  <div className="mt-2 text-[11px] text-white/40">{field.hint}</div>
                )}
                {errors[field.name] && (
                  <div className="mt-2 text-[11px] text-rose-300">
                    {errors[field.name]}
                  </div>
                )}
              </label>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-sm ui-text-subtle">
            Поля формы будут добавлены на следующем этапе.
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSubmit}>{primaryActionLabel}</Button>
          <Button variant="secondary">Сохранить черновик</Button>
        </div>
      </div>
    </Card>
  );
}
