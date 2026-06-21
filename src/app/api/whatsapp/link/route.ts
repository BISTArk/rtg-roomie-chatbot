import { generateId } from "ai";
import type { PersistedChatMessage } from "@/lib/chat-types";
import {
  generateConversationSummary,
  runWhatsAppChatTurn,
} from "@/lib/chat-turn";
import {
  buildWhatsAppHandoffMessage,
  isTwilioWhatsAppConfigured,
  normalizePhoneToE164,
  sendTwilioWhatsAppMessage,
} from "@/lib/twilio-whatsapp";
import {
  getActiveCatalogDataset,
  resolveTenantFromToken,
  saveSessionState,
} from "@/lib/tenant-platform";
import { upsertWhatsAppLink, touchWhatsAppLinkActivity } from "@/lib/whatsapp-links";
import { DEFAULT_WIDGET_BRANDING } from "@/lib/widget-config";
import type { VisitorProfile } from "@/lib/visitor-profile";

export const maxDuration = 300;

type LinkRequestBody = {
  tenantKey?: string;
  sessionId?: string;
  phone?: string;
  consent?: boolean;
  hostOrigin?: string;
  lastPageUrl?: string;
  messages?: PersistedChatMessage[];
  visitorProfile?: VisitorProfile | null;
  suggestions?: string[];
};

export async function POST(request: Request) {
  try {
    if (!isTwilioWhatsAppConfigured()) {
      return Response.json(
        { error: "WhatsApp is not configured on this deployment." },
        { status: 503 }
      );
    }

    const tenantToken = request.headers.get("x-tenant-token");
    const body = (await request.json()) as LinkRequestBody;
    const tenantKey = String(body.tenantKey || "").trim();
    const sessionId = String(body.sessionId || "").trim();
    const phone = String(body.phone || "").trim();

    if (!tenantKey || !sessionId || !phone) {
      return Response.json(
        { error: "tenantKey, sessionId, and phone are required." },
        { status: 400 }
      );
    }

    if (!body.consent) {
      return Response.json(
        { error: "Consent is required to continue on WhatsApp." },
        { status: 400 }
      );
    }

    const tenant = await resolveTenantFromToken(tenantKey, tenantToken);
    if (tenant.prompt.whatsappEnabled === false) {
      return Response.json(
        { error: "WhatsApp continuation is disabled for this store." },
        { status: 403 }
      );
    }

    const phoneE164 = normalizePhoneToE164(phone);
    const messages = Array.isArray(body.messages) ? body.messages : [];

    await saveSessionState({
      tenantId: tenant.tenantId,
      sessionId,
      hostOrigin: body.hostOrigin,
      lastPageUrl: body.lastPageUrl,
      messages,
      visitorProfile: body.visitorProfile ?? null,
      suggestions: body.suggestions,
    });

    await upsertWhatsAppLink({
      tenantId: tenant.tenantId,
      clientSessionId: sessionId,
      phoneE164,
      consentAt: new Date().toISOString(),
    });

    const summary = await generateConversationSummary({
      tenant,
      messages,
    });

    const assistantName =
      tenant.branding.assistantName?.trim() ||
      DEFAULT_WIDGET_BRANDING.assistantName;
    const handoffMessage = buildWhatsAppHandoffMessage({
      assistantName,
      summary,
      template: tenant.prompt.whatsappHandoffMessage,
    });

    await sendTwilioWhatsAppMessage({
      toPhoneE164: phoneE164,
      body: handoffMessage,
      fromOverride: tenant.prompt.whatsappFromNumber,
    });

    await touchWhatsAppLinkActivity({
      tenantId: tenant.tenantId,
      phoneE164,
      direction: "outbound",
    });

    const transferMessage: PersistedChatMessage = {
      id: generateId(),
      role: "assistant",
      text: "Great — check WhatsApp to continue this conversation there.",
    };

    await saveSessionState({
      tenantId: tenant.tenantId,
      sessionId,
      hostOrigin: body.hostOrigin,
      lastPageUrl: body.lastPageUrl,
      messages: [...messages, transferMessage],
      visitorProfile: body.visitorProfile ?? null,
      suggestions: body.suggestions,
    });

    return Response.json({
      ok: true,
      phoneE164,
      transferMessage,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "WhatsApp link failed.",
      },
      { status: 500 }
    );
  }
}
