/** Hardcoded admin credentials — not secure, hobby use only */
export const ADMIN_CREDENTIALS = {
  username: "admin",
  password: "gridiron2026",
} as const;

export const AUTH_COOKIE = "gridiron-admin-session";
export const AUTH_SECRET = process.env.AUTH_SECRET ?? "gridiron-dev-secret-change-me";
