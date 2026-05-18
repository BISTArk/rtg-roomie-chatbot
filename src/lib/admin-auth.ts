import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "shop_assist_admin_session";
const DEFAULT_DURATION_MS = 1000 * 60 * 60 * 12;

function getAdminUser(): string {
  return process.env.ADMIN_USERNAME?.trim() || "admin";
}

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || "change-me";
}

function getSecret(): string {
  return process.env.ADMIN_SESSION_SECRET?.trim() || "shop-assist-admin-dev-secret";
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function compareSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function validateAdminCredentials(username: string, password: string): boolean {
  return compareSecret(username, getAdminUser()) && compareSecret(password, getAdminPassword());
}

export function createAdminSessionValue(): string {
  const payload = JSON.stringify({
    user: getAdminUser(),
    exp: Date.now() + DEFAULT_DURATION_MS,
  });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAdminSessionValue(value: string | undefined): boolean {
  if (!value) return false;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return false;
  if (!compareSecret(signature, sign(encoded))) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      user: string;
      exp: number;
    };
    return payload.user === getAdminUser() && typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionValue(store.get(COOKIE_NAME)?.value);
}

export const ADMIN_SESSION_COOKIE = COOKIE_NAME;
