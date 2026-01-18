type PriceBenchProps = {
  priceRange: string;
  moqRange?: string;
  leadTime?: string;
};

export function PriceBench({ priceRange, moqRange, leadTime }: PriceBenchProps) {
  return (
    <div className="ui-glass rounded-2xl p-4 text-sm text-white/80">
      <div className="text-xs font-semibold uppercase ui-text-subtle">
        Benchmark
      </div>
      <div className="mt-2 space-y-1">
        <div>
          Цена: <span className="font-medium">{priceRange}</span>
        </div>
        {moqRange && (
          <div>
            MOQ: <span className="font-medium">{moqRange}</span>
          </div>
        )}
        {leadTime && (
          <div>
            Lead time: <span className="font-medium">{leadTime}</span>
          </div>
        )}
      </div>
    </div>
  );
}
