type HSCodeChipProps = {
  code: string;
  confidence?: string;
};

export function HSCodeChip({ code, confidence }: HSCodeChipProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full ui-glass px-3 py-1 text-[11px] text-white/80">
      HS {code}
      {confidence && (
        <span className="text-[10px] ui-text-muted">
          {confidence}
        </span>
      )}
    </span>
  );
}
