"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PriceBench } from "@/components/domain/PriceBench";
import { SupplierRow } from "@/components/domain/SupplierRow";
import { Button } from "@/components/ui/Button";
import { useSupabaseAuth } from "@/lib/auth/supabaseAuth";
import { searchSuppliers } from "@/lib/api/apify";
import type { ApifySearchResult } from "@/lib/api/apify";
import { supabaseClient } from "@/lib/supabase/client";

type Product3SearchProps = {
  query: string;
  onQueryChange: (value: string) => void;
  searchToken: number;
};

export function Product3Search({ query, onQueryChange, searchToken }: Product3SearchProps) {
  const [results, setResults] = useState<ApifySearchResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useSupabaseAuth();
  const [orderId, setOrderId] = useState<string | null>(null);
  const lastTokenRef = useRef<number>(searchToken);

  const parseNumbers = (value?: string | null) => {
    if (!value) return [];
    const normalized = value.replace(/,/g, " ");
    const matches = normalized.match(/\d+(\.\d+)?/g);
    return matches ? matches.map((item) => Number(item)).filter(Number.isFinite) : [];
  };

  const formatRange = (min: number, median: number, max: number) => {
    const format = (value: number) =>
      Number.isInteger(value) ? value.toString() : value.toFixed(2);
    return `${format(min)} / ${format(median)} / ${format(max)}`;
  };

  const priceBench = useMemo(() => {
    if (!results.length) return null;
    const priceValues = results
      .map((item) => {
        const numbers = parseNumbers(item.price);
        if (!numbers.length) return null;
        if (numbers.length === 1) return numbers[0];
        return (numbers[0] + numbers[1]) / 2;
      })
      .filter((value): value is number => value !== null);
    if (!priceValues.length) return null;
    const sorted = [...priceValues].sort((a, b) => a - b);
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
    return formatRange(sorted[0], median, sorted[sorted.length - 1]);
  }, [results]);

  const moqRange = useMemo(() => {
    if (!results.length) return null;
    const moqValues = results
      .map((item) => {
        const numbers = parseNumbers(item.moq);
        return numbers.length ? numbers[0] : null;
      })
      .filter((value): value is number => value !== null);
    if (!moqValues.length) return null;
    const min = Math.min(...moqValues);
    const max = Math.max(...moqValues);
    return min === max ? `${min}` : `${min}–${max}`;
  }, [results]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    setMessage(null);
    let nextOrderId = orderId;
    if (!nextOrderId && user) {
      const { data } = await supabaseClient
        .from("orders")
        .insert({
          user_id: user.id,
          product_type: "p3",
          status: "processing",
          price: 10,
          currency: "USD",
        })
        .select("id")
        .single();
      if (data?.id) {
        nextOrderId = data.id;
        setOrderId(data.id);
      }
    }
    try {
      const data = await searchSuppliers(query.trim(), 20);
      if (!data.ok) {
        setMessage(data.message ?? "Не удалось получить данные.");
        setResults([]);
      } else {
        const deduped = new Map<string, ApifySearchResult>();
        (data.items ?? []).forEach((item) => {
          const key = item.url ?? `${item.source}:${item.title ?? ""}:${item.location ?? ""}`;
          if (!deduped.has(key)) {
            deduped.set(key, item);
          }
        });
        const finalItems = Array.from(deduped.values());
        setResults(finalItems);
        if (user && nextOrderId) {
          await supabaseClient.from("reports").insert({
            order_id: nextOrderId,
            user_id: user.id,
            product_type: "p3",
            status: "ready",
            result_summary: {
              itemsCount: finalItems.length,
              query: query.trim(),
            },
          });
          await supabaseClient
            .from("orders")
            .update({ status: "done" })
            .eq("id", nextOrderId);
        }
      }
    } catch {
      setMessage("Ошибка запроса к Apify.");
      setResults([]);
      if (nextOrderId) {
        await supabaseClient
          .from("orders")
          .update({ status: "failed" })
          .eq("id", nextOrderId);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (searchToken !== lastTokenRef.current) {
      lastTokenRef.current = searchToken;
      void handleSearch();
    }
  }, [searchToken, query]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/80 placeholder:text-white/40"
          placeholder="Например: LED light, phone case, ceramic tiles"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <Button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? "Поиск..." : "Запустить поиск"}
        </Button>
      </div>
      {message && (
        <div className="text-xs text-white/60">{message}</div>
      )}
      {priceBench && (
        <PriceBench priceRange={priceBench} moqRange={moqRange ?? undefined} />
      )}
      {results.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {results.map((item, index) => (
            <SupplierRow
              key={`${item.source}-${index}`}
              source={item.source}
              title={item.title ?? "Без названия"}
              price={item.price}
              moq={item.moq}
              location={item.location}
              url={item.url}
            />
          ))}
        </div>
      )}
    </div>
  );
}
