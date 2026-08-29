"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_CREDENTIALS, AUTH_COOKIE } from "@/config/auth";
import { getAdminSessionCookieOptions, signAdminToken } from "@/lib/auth";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (
    username !== ADMIN_CREDENTIALS.username ||
    password !== ADMIN_CREDENTIALS.password
  ) {
    return { error: "Invalid username or password" };
  }

  const token = await signAdminToken();
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, token, getAdminSessionCookieOptions());
  redirect("/admin");
}
