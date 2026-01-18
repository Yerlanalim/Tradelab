type SupplierRowProps = {
  source?: string;
  title: string;
  price?: string | null;
  moq?: string | null;
  location?: string | null;
  url?: string | null;
};

export function SupplierRow({
  source,
  title,
  price,
  moq,
  location,
  url,
}: SupplierRowProps) {
  return (
    <div className="ui-glass rounded-2xl p-4 text-sm text-white/80">
      {source && (
        <div className="text-xs uppercase ui-text-subtle">{source}</div>
      )}
      <div className="mt-1 font-semibold text-white">{title}</div>
      <div className="mt-2 space-y-1 text-sm ui-text-muted">
        {price && <div>Цена: {price}</div>}
        {moq && <div>MOQ: {moq}</div>}
        {location && <div>Локация: {location}</div>}
      </div>
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
    </div>
  );
}
