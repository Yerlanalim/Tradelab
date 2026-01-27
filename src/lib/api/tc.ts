import { supabaseClient } from "@/lib/supabase/client";

export type TcBalance = {
  balance_total: number;
  balance_purchased: number;
  balance_bonus: number;
  balance_promo: number;
  balance_welcome: number;
  next_expiry: string | null;
};

export type TcLedgerRow = {
  id: string;
  tx_type: "credit" | "debit";
  amount: number;
  credit_type: "purchased" | "bonus" | "promo" | "welcome" | null;
  reason: string | null;
  ref_id: string | null;
  created_at: string;
};

const emptyBalance: TcBalance = {
  balance_total: 0,
  balance_purchased: 0,
  balance_bonus: 0,
  balance_promo: 0,
  balance_welcome: 0,
  next_expiry: null,
};

const getCurrentUserId = async () => {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const sessionUserId = sessionData.session?.user?.id ?? null;
  if (sessionUserId) return sessionUserId;
  const { data: userData } = await supabaseClient.auth.getUser();
  return userData.user?.id ?? null;
};

export async function fetchTcBalance(): Promise<TcBalance> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return emptyBalance;
  }
  const { data, error } = await supabaseClient.rpc("tc_get_balance", {
    p_user_id: userId,
  });
  if (error) {
    const fallback = await supabaseClient
      .from("tc_balances")
      .select(
        "balance_total,balance_purchased,balance_bonus,balance_promo,balance_welcome,next_expiry"
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (fallback.error) {
      throw new Error(`${error.message}; fallback: ${fallback.error.message}`);
    }
    const row = fallback.data ?? null;
    return {
      balance_total: Number(row?.balance_total ?? 0),
      balance_purchased: Number(row?.balance_purchased ?? 0),
      balance_bonus: Number(row?.balance_bonus ?? 0),
      balance_promo: Number(row?.balance_promo ?? 0),
      balance_welcome: Number(row?.balance_welcome ?? 0),
      next_expiry: row?.next_expiry ?? null,
    };
  }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return {
    balance_total: Number(row?.balance_total ?? 0),
    balance_purchased: Number(row?.balance_purchased ?? 0),
    balance_bonus: Number(row?.balance_bonus ?? 0),
    balance_promo: Number(row?.balance_promo ?? 0),
    balance_welcome: Number(row?.balance_welcome ?? 0),
    next_expiry: row?.next_expiry ?? null,
  };
}

export async function fetchTcLedger(limit = 50): Promise<TcLedgerRow[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { data, error } = await supabaseClient
    .from("tc_ledger")
    .select("id,tx_type,amount,credit_type,reason,ref_id,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as TcLedgerRow[];
}

export async function grantTcBonus(payload: {
  userId: string;
  amount: number;
  creditType: "bonus" | "promo" | "welcome" | "purchased";
  reason?: string;
  expiresAt?: string | null;
  refId?: string | null;
}) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("User is not authenticated");
  }

  const { data, error } = await supabaseClient.functions.invoke("tc_admin_grant", {
    body: {
      user_id: payload.userId,
      amount: payload.amount,
      credit_type: payload.creditType,
      reason: payload.reason,
      expires_at: payload.expiresAt,
      ref_id: payload.refId,
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { ok: boolean; balance_total?: number | null; message?: string };
}
