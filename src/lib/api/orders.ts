import { supabaseClient } from "@/lib/supabase/client";
import type { Order } from "@/lib/types/core";

type SupabaseOrderRow = {
  id: string;
  user_id: string;
  product_type: string;
  status: string;
  price: number;
  currency: string;
  created_at: string;
};

const mapOrder = (row: SupabaseOrderRow): Order => ({
  id: row.id,
  userId: row.user_id,
  productType: row.product_type as Order["productType"],
  status: row.status as Order["status"],
  price: row.price,
  currency: row.currency as Order["currency"],
  createdAt: row.created_at,
});

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabaseClient
    .from("orders")
    .select("id,user_id,product_type,status,price,currency,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapOrder);
}
