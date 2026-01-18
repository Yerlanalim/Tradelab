import type { ReactNode } from "react";

type TableProps = {
  headers: string[];
  rows: ReactNode[][];
};

export function Table({ headers, rows }: TableProps) {
  return (
    <div className="ui-glass overflow-hidden rounded-2xl">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-white/10 text-left text-xs uppercase tracking-wide ui-text-subtle">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((row, index) => (
            <tr key={index} className="bg-white/5">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-4 py-3 text-white/80"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
