import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";

const parseAdminEmails = (value?: string | null) => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

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
  return NextResponse.json({ ok: true, is_admin: isAdmin });
}
