import { NextRequest, NextResponse } from "next/server";
import { ADMIN_CREDENTIALS, AUTH_COOKIE } from "@/config/auth";
import { getAdminSessionCookieOptions, signAdminToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "").trim();

  if (
    username === ADMIN_CREDENTIALS.username &&
    password === ADMIN_CREDENTIALS.password
  ) {
    const token = await signAdminToken();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_COOKIE, token, getAdminSessionCookieOptions());
    return response;
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
