"use client";

import { useEffect, useState } from "react";

import { supabaseClient } from "@/lib/supabase/client";

type ContentItem = {
  id: string;
  title: string;
  body: string | null;
  tags: string[] | null;
};

type ContentListProps = {
  type: "library" | "map" | "zone" | "exhibition";
  tags?: string[];
};

export function ContentList({ type, tags }: ContentListProps) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      let query = supabaseClient
        .from("content_items")
        .select("id,title,body,tags")
        .eq("type", type)
        .order("created_at", { ascending: false });
      if (tags?.length) {
        query = query.contains("tags", tags);
      }
      const { data } = await query;

      if (isMounted) {
        setItems(data ?? []);
        setIsLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [type, tags]);

  if (isLoading) {
    return (
      <div className="mt-6 text-sm ui-text-muted">Загрузка контента...</div>
    );
  }

  if (!items.length) {
    return (
      <div className="mt-6 text-sm ui-text-muted">Контент пока не добавлен.</div>
    );
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="ui-glass rounded-2xl p-4 text-sm text-white/80"
        >
          <div className="font-semibold text-white">{item.title}</div>
          {item.body && <p className="mt-2 text-sm">{item.body}</p>}
          {item.tags?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/10 px-2 py-1 text-[11px] ui-text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
