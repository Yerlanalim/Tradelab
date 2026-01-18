import { supabaseClient } from "@/lib/supabase/client";

export type ApifySearchResult = {
  source: string;
  title?: string;
  price?: string;
  url?: string;
  moq?: string;
  location?: string;
  raw: Record<string, unknown>;
};

export async function searchSuppliers(query: string, limit = 20) {
  const { data, error } = await supabaseClient.functions.invoke("apify_proxy", {
    body: { query, limit },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { ok: boolean; items: ApifySearchResult[]; message?: string };
}
