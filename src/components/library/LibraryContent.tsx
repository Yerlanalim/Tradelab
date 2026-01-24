"use client";

import { useMemo, useState } from "react";

import { ContentList } from "@/components/content/ContentList";
import { Button } from "@/components/ui/Button";

export function LibraryContent() {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const tags = useMemo(
    () => [
      "supplier",
      "checklist",
      "rfq",
      "quote",
      "hs",
      "guide",
      "incoterms",
      "logistics",
      "landed-cost",
      "finance",
      "quality",
      "contract",
      "payment",
      "shipping",
    ],
    []
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
        <span className="mr-2 text-[11px] uppercase text-white/50">Фильтры</span>
        <Button
          variant={activeTag ? "secondary" : "primary"}
          className="text-xs"
          onClick={() => setActiveTag(null)}
        >
          Все
        </Button>
        {tags.map((tag) => (
          <Button
            key={tag}
            variant={activeTag === tag ? "primary" : "secondary"}
            className="text-xs"
            onClick={() => setActiveTag(tag)}
          >
            {tag}
          </Button>
        ))}
      </div>
      <ContentList type="library" tags={activeTag ? [activeTag] : undefined} />
    </>
  );
}
