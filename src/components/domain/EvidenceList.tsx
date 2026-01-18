type EvidenceItem = {
  label: string;
  value: string;
  note?: string;
};

type EvidenceListProps = {
  title?: string;
  items: EvidenceItem[];
};

export function EvidenceList({ title, items }: EvidenceListProps) {
  return (
    <div className="ui-glass rounded-2xl p-4 space-y-3">
      {title && (
        <div className="text-xs font-semibold uppercase ui-text-subtle">
          {title}
        </div>
      )}
      <div className="space-y-2 text-sm text-white/80">
        {items.map((item) => (
          <div key={`${item.label}-${item.value}`}>
            <div className="font-medium text-white">
              {item.label}: <span className="font-normal">{item.value}</span>
            </div>
            {item.note && (
              <div className="text-xs ui-text-muted">{item.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
