import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_COUNTRY_CODE = "1";

export function isTwilioWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim()
  );
}

export function getTwilioWhatsAppConfigStatus(): {
  configured: boolean;
  hasAccountSid: boolean;
  hasAuthToken: boolean;
  hasFrom: boolean;
} {
  return {
    configured: isTwilioWhatsAppConfigured(),
    hasAccountSid: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()),
    hasAuthToken: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
    hasFrom: Boolean(process.env.TWILIO_WHATSAPP_FROM?.trim()),
  };
}

export function getTwilioWhatsAppFrom(override?: string | null): string {
  const from = override?.trim() || process.env.TWILIO_WHATSAPP_FROM?.trim() || "";
  if (!from) {
    throw new Error("Twilio WhatsApp sender number is not configured.");
  }
  return from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
}

export function normalizePhoneToE164(input: string, defaultCountryCode = DEFAULT_COUNTRY_CODE): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Phone number is required.");
  }

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      throw new Error("Enter a valid phone number with country code.");
    }
    return `+${digits}`;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+${defaultCountryCode}${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new Error("Enter a valid phone number.");
}

export function toTwilioWhatsAppAddress(phoneE164: string): string {
  const normalized = phoneE164.startsWith("+") ? phoneE164 : `+${phoneE164.replace(/\D/g, "")}`;
  return normalized.startsWith("whatsapp:") ? normalized : `whatsapp:${normalized}`;
}

export function parseTwilioWhatsAppAddress(address: string): string {
  const value = address.trim();
  const withoutPrefix = value.startsWith("whatsapp:") ? value.slice("whatsapp:".length) : value;
  return normalizePhoneToE164(withoutPrefix);
}

export function getTwilioWebhookUrl(path = "/api/whatsapp/webhook"): string {
  const base =
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim() ||
    process.env.SHOPIFY_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (!base) {
    throw new Error("TWILIO_WEBHOOK_BASE_URL is required for webhook validation.");
  }

  const normalizedBase = base.startsWith("http") ? base : `https://${base}`;
  return `${normalizedBase.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function verifyTwilioSignature(input: {
  signature: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken || !input.signature) return false;

  const sortedKeys = Object.keys(input.params).sort();
  let payload = input.url;
  for (const key of sortedKeys) {
    payload += key + input.params[key];
  }

  const expected = createHmac("sha1", authToken)
    .update(Buffer.from(payload, "utf-8"))
    .digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(input.signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

export async function sendTwilioWhatsAppMessage(input: {
  toPhoneE164: string;
  body: string;
  fromOverride?: string | null;
}): Promise<{ sid: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured.");
  }

  const from = getTwilioWhatsAppFrom(input.fromOverride);
  const to = toTwilioWhatsAppAddress(input.toPhoneE164);
  const body = input.body.trim();
  if (!body) {
    throw new Error("WhatsApp message body is required.");
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: from,
        To: to,
        Body: body.slice(0, 4096),
      }),
    }
  );

  const payload = (await response.json()) as { sid?: string; message?: string; code?: number };
  if (!response.ok) {
    throw new Error(payload.message || "Failed to send WhatsApp message.");
  }

  return { sid: payload.sid || "" };
}

export function buildWhatsAppHandoffMessage(input: {
  assistantName: string;
  summary: string;
  template?: string;
}): string {
  const summary = input.summary.trim() || "your mattress shopping questions";
  if (input.template?.trim()) {
    return input.template
      .replace(/\{\{\s*summary\s*\}\}/gi, summary)
      .replace(/\{\{\s*assistantName\s*\}\}/gi, input.assistantName)
      .trim();
  }

  return `Hi! You were chatting with ${input.assistantName} on our website about ${summary} Reply here anytime to keep shopping with me.`;
}
