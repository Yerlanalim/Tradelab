import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";

const parseAdminEmails = (value?: string | null) => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

const isFiniteNumber = (value: number) => Number.isFinite(value) && value > 0;

export async function GET(req: Request) {
  const tokenHeader = req.headers.get("Authorization") ?? "";
  const token = tokenHeader.startsWith("Bearer ") ? tokenHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const adminEmails = parseAdminEmails(
    process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS
  );
  if (!adminEmails.length) {
    return NextResponse.json(
      { ok: false, message: "ADMIN_EMAILS not configured", is_admin: false },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const email = (data.user.email ?? "").toLowerCase();
  const isAdmin = adminEmails.includes(email);
  if (!isAdmin) {
    return NextResponse.json({ ok: false, message: "Access denied", is_admin: false }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "30");
  const since = new Date(
    Date.now() - (isFiniteNumber(days) ? days : 30) * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: events, error: eventsError } = await supabaseServer
    .from("p3_events")
    .select("event_type,event_meta,created_at")
    .gte("created_at", since);

  if (eventsError) {
    return NextResponse.json({ ok: false, message: eventsError.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  const errorCodes: Record<string, number> = {};
  const items = events ?? [];

  for (const event of items) {
    const type = event.event_type ?? "unknown";
    counts[type] = (counts[type] ?? 0) + 1;
    if (type === "error") {
      const code = event.event_meta?.code ?? "unknown";
      errorCodes[code] = (errorCodes[code] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    ok: true,
    range_days: isFiniteNumber(days) ? days : 30,
    total: items.length,
    counts,
    errors: errorCodes,
  });
}
