import { createHmac, timingSafeEqual } from "crypto";

interface TenantTokenPayload {
  tenantId: string;
  tenantKey: string;
  hostOrigin: string;
  exp: number;
}

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12;

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function getSigningSecret(): string {
  return (
    process.env.TENANT_TOKEN_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    "shop-assist-dev-secret-change-me"
  );
}

function sign(value: string): string {
  return createHmac("sha256", getSigningSecret()).update(value).digest("base64url");
}

export function createTenantToken(input: {
  tenantId: string;
  tenantKey: string;
  hostOrigin: string;
  ttlMs?: number;
}): string {
  const payload: TenantTokenPayload = {
    tenantId: input.tenantId,
    tenantKey: input.tenantKey,
    hostOrigin: input.hostOrigin,
    exp: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
  };

  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifyTenantToken(
  token: string | null | undefined
): TenantTokenPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as TenantTokenPayload;
    if (
      !payload.tenantId ||
      !payload.tenantKey ||
      !payload.hostOrigin ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function normalizeOrigin(input: string | null | undefined): string {
  const value = String(input || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return parsed.origin.toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeHostname(input: string | null | undefined): string {
  const origin = normalizeOrigin(input);
  if (!origin) return "";
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}
