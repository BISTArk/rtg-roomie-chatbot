import { generateId } from "ai";
import type { PersistedChatMessage } from "@/lib/chat-types";
import { runWhatsAppChatTurn } from "@/lib/chat-turn";
import {
  getTwilioWebhookUrl,
  isTwilioWhatsAppConfigured,
  parseTwilioWhatsAppAddress,
  sendTwilioWhatsAppMessage,
  verifyTwilioSignature,
} from "@/lib/twilio-whatsapp";
import {
  getActiveCatalogDataset,
  loadSessionState,
  recordConversationAnalytics,
  resolveTenantById,
  saveSessionState,
} from "@/lib/tenant-platform";
import {
  findWhatsAppLinkByPhone,
  touchWhatsAppLinkActivity,
} from "@/lib/whatsapp-links";

export const maxDuration = 300;

function twiml(): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: Request) {
  if (!isTwilioWhatsAppConfigured()) {
    return twiml();
  }

  const formData = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    params[key] = String(value);
  }

  const signature = request.headers.get("x-twilio-signature");
  const webhookUrl = getTwilioWebhookUrl();
  if (!verifyTwilioSignature({ signature, url: webhookUrl, params })) {
    return new Response("Invalid Twilio signature.", { status: 403 });
  }

  const fromAddress = params.From || "";
  const inboundBody = (params.Body || "").trim();
  if (!fromAddress || !inboundBody) {
    return twiml();
  }

  let phoneE164: string;
  try {
    phoneE164 = parseTwilioWhatsAppAddress(fromAddress);
  } catch {
    return twiml();
  }

  const link = await findWhatsAppLinkByPhone(phoneE164);
  if (!link) {
    await sendTwilioWhatsAppMessage({
      toPhoneE164: phoneE164,
      body: "Sorry, I couldn't find an active shopping conversation for this number. Please start again on the store website.",
    }).catch(() => undefined);
    return twiml();
  }

  const tenant = await resolveTenantById(link.tenantId);
  if (!tenant || tenant.prompt.whatsappEnabled === false) {
    return twiml();
  }

  const session = await loadSessionState(tenant.tenantId, link.clientSessionId);
  const userMessage: PersistedChatMessage = {
    id: generateId(),
    role: "user",
    text: inboundBody,
  };
  const messages = [...session.messages, userMessage];

  await saveSessionState({
    tenantId: tenant.tenantId,
    sessionId: link.clientSessionId,
    messages,
    visitorProfile: session.visitorProfile,
    suggestions: session.suggestions,
  });

  await touchWhatsAppLinkActivity({
    tenantId: tenant.tenantId,
    phoneE164,
    direction: "inbound",
  });

  try {
    const catalogDataset = await getActiveCatalogDataset(tenant.tenantId);
    const result = await runWhatsAppChatTurn({
      tenant,
      messages,
      branding: tenant.branding,
      catalogDataset,
    });

    await saveSessionState({
      tenantId: tenant.tenantId,
      sessionId: link.clientSessionId,
      messages: result.messages,
      visitorProfile: session.visitorProfile,
      suggestions: [],
    });

    await sendTwilioWhatsAppMessage({
      toPhoneE164: phoneE164,
      body: result.replyText,
      fromOverride: tenant.prompt.whatsappFromNumber,
    });

    await touchWhatsAppLinkActivity({
      tenantId: tenant.tenantId,
      phoneE164,
      direction: "outbound",
    });

    await recordConversationAnalytics({
      tenantId: tenant.tenantId,
      sessionId: link.clientSessionId,
      requestType: "whatsapp",
      conversationStage: "whatsapp",
      modelKey: "default",
      modelId: "whatsapp",
      inputMessageCount: messages.length,
      responseCharCount: result.replyText.length,
      status: "completed",
    });
  } catch (error) {
    await recordConversationAnalytics({
      tenantId: tenant.tenantId,
      sessionId: link.clientSessionId,
      requestType: "whatsapp",
      conversationStage: "whatsapp",
      modelKey: "default",
      modelId: "whatsapp",
      inputMessageCount: messages.length,
      status: "error",
      errorText: error instanceof Error ? error.message : "WhatsApp chat failed",
    });

    await sendTwilioWhatsAppMessage({
      toPhoneE164: phoneE164,
      body: "Sorry, something went wrong. Please try again in a moment.",
      fromOverride: tenant.prompt.whatsappFromNumber,
    }).catch(() => undefined);
  }

  return twiml();
}
