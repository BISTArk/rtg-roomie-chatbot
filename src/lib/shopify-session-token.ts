import { createHmac, timingSafeEqual } from "crypto";

export interface ShopifySessionTokenPayload {
  iss: string;
  dest: string;
  aud: string;
  sub: string;
  exp: number;
  nbf: number;
  iat: number;
  jti?: string;
  sid?: string;
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

export function verifyShopifySessionToken(input: {
  token: string;
  apiKey: string;
  apiSecret: string;
}): ShopifySessionTokenPayload {
  const token = String(input.token || "").trim();
  if (!token) {
    throw new Error("Missing Shopify session token.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid Shopify session token format.");
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const signedContent = `${headerPart}.${payloadPart}`;
  const expectedSignature = createHmac("sha256", input.apiSecret)
    .update(signedContent)
    .digest();
  const actualSignature = decodeBase64Url(signaturePart);

  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    throw new Error("Invalid Shopify session token signature.");
  }

  const payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf8")) as ShopifySessionTokenPayload;
  const now = Math.floor(Date.now() / 1000);

  if (!payload.exp || payload.exp <= now) {
    throw new Error("Shopify session token expired.");
  }
  if (payload.nbf && payload.nbf > now) {
    throw new Error("Shopify session token is not active yet.");
  }
  if (payload.aud !== input.apiKey) {
    throw new Error("Invalid Shopify session token audience.");
  }
  if (!payload.dest || !payload.sub) {
    throw new Error("Shopify session token payload was incomplete.");
  }

  return payload;
}

export function getShopDomainFromSessionToken(payload: ShopifySessionTokenPayload): string {
  try {
    return new URL(payload.dest.startsWith("http") ? payload.dest : `https://${payload.dest}`).hostname;
  } catch {
    return payload.dest.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}
