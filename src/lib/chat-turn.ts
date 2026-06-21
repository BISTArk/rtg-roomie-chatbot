import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  generateId,
  generateText,
  isLoopFinished,
  type UIMessage,
} from "ai";
import type { PersistedChatMessage } from "@/lib/chat-types";
import { buildCatalogPlaceholder } from "@/lib/catalog-retrieval";
import { isComplaintMessage } from "@/lib/complaint-detection";
import { stripUnresolvedToolParts } from "@/lib/message-tools";
import { DEFAULT_MODEL, MODEL_MAP } from "@/lib/models";
import type { CatalogDataset, TenantRuntimeConfig } from "@/lib/platform-types";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { getWelcomeMessage } from "@/lib/widget-config";
import type { WidgetBranding } from "@/lib/widget-config";
import { createChatTools } from "@/tools";

const CATALOG_AGENT_NOTE =
  "The full product catalog is not injected into this prompt. Use the product_search tool to retrieve matching products from the full store catalog.";

const WHATSAPP_CHANNEL_NOTE = [
  "You are responding on WhatsApp.",
  "Use plain text only. No HTML, markdown tables, code fences, or action tiles.",
  "When recommending products, list each product on its own line with name, price, and URL.",
  "Keep responses concise and conversational.",
  "Do not call ask_user_question or compare_tool on WhatsApp.",
].join(" ");

function getTextFromUiMessage(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function buildConversationContext(
  messages: Array<{ role: "user" | "assistant"; text: string }>
): string {
  return messages
    .slice(-8)
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");
}

export function persistedToUiMessages(messages: PersistedChatMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts:
      Array.isArray(message.parts) && message.parts.length > 0
        ? message.parts
        : [{ type: "text" as const, text: message.text }],
  }));
}

export function uiMessagesToPersisted(messages: UIMessage[]): PersistedChatMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      id: message.id,
      role: message.role as "user" | "assistant",
      text: getTextFromUiMessage(message),
      parts: message.parts,
    }));
}

export function stripRichContentForWhatsApp(text: string): string {
  return text
    .replace(/```html[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1: $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeForModel(
  messages: UIMessage[],
  branding?: Partial<WidgetBranding>
): Omit<UIMessage, "id">[] {
  const hasWelcome = messages.some((message) => message.id === "welcome");
  const cleaned = stripUnresolvedToolParts(messages)
    .filter((message) => message.id !== "welcome")
    .map((message) => {
      const { id, ...rest } = message;
      void id;
      return rest as Omit<UIMessage, "id">;
    });

  if (hasWelcome) {
    cleaned.unshift({
      role: "assistant",
      parts: [
        {
          type: "text",
          text: getWelcomeMessage({
            assistantName:
              typeof branding?.assistantName === "string" && branding.assistantName.trim()
                ? branding.assistantName.trim()
                : "Shopping Assistant",
            launcherLabel: "",
            headerTitle: "",
            inputPlaceholder: "",
            humanModeBannerText: "",
            whatsappModeBannerText: "",
            whatsappButtonLabel: "",
            whatsappConsentText: "",
            quickChips: [],
            logoMode: "none",
          }),
        },
      ],
    } as Omit<UIMessage, "id">);
  }

  return cleaned;
}

function createWhatsAppChatTools(input: {
  catalogDataset: CatalogDataset | null;
  tenant: TenantRuntimeConfig;
  plainMessages: Array<{ role: "user" | "assistant"; text: string }>;
}) {
  const tools = createChatTools({
    catalogDataset: input.catalogDataset,
    skillPrompts: input.tenant.skillPrompts,
    conversationContext: buildConversationContext(input.plainMessages),
    pageContextSummary: "",
  });

  const { ask_user_question: _ask, compare_tool: _compare, ...whatsappTools } = tools;
  void _ask;
  void _compare;
  return whatsappTools;
}

function createChatModel(tenant: TenantRuntimeConfig, modelKey = DEFAULT_MODEL) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const openrouter = createOpenRouter({
    apiKey,
    appName: tenant.appName,
    appUrl: tenant.appUrl,
  });
  const modelId = MODEL_MAP[modelKey] ?? MODEL_MAP[DEFAULT_MODEL];
  return openrouter.chat(modelId, {
    reasoning: {
      effort: "low",
      exclude: true,
    },
  });
}

export async function generateConversationSummary(input: {
  tenant: TenantRuntimeConfig;
  messages: PersistedChatMessage[];
}): Promise<string> {
  const transcript = input.messages
    .filter((message) => message.id !== "welcome" && message.text.trim())
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");

  if (!transcript.trim()) {
    return "your mattress shopping questions";
  }

  const result = await generateText({
    model: createChatModel(input.tenant),
    system:
      "You are a helpful assistant. Complete this phrase naturally in under 15 words, describing what the customer was looking for based on the conversation: 'looking for...'. Start directly with 'looking for' and end with a period. Do not include any preamble.",
    prompt: `Summarize this conversation:\n${transcript}`,
  });

  const summary = stripRichContentForWhatsApp(result.text);
  return summary || "your mattress shopping questions";
}

export async function runWhatsAppChatTurn(input: {
  tenant: TenantRuntimeConfig;
  messages: PersistedChatMessage[];
  branding?: Partial<WidgetBranding>;
  catalogDataset: CatalogDataset | null;
}): Promise<{ replyText: string; messages: PersistedChatMessage[] }> {
  const uiMessages = persistedToUiMessages(input.messages);
  const plainMessages = uiMessages.map((message) => ({
    role: message.role as "user" | "assistant",
    text: getTextFromUiMessage(message),
  }));
  const lastUser = [...plainMessages].reverse().find((message) => message.role === "user");
  const userSaidComplaint = lastUser ? isComplaintMessage(lastUser.text) : false;
  const catalogData = buildCatalogPlaceholder(CATALOG_AGENT_NOTE);

  const systemPrompt = [
    buildSystemPrompt(catalogData, {
      systemPrompt: input.tenant.systemPrompt,
      skillPrompts: input.tenant.skillPrompts,
      preloadedSkills: [{ name: "discovery" }, { name: "recommendation" }],
      visitorProfile: undefined,
      pageContext: undefined,
      complaintHint: userSaidComplaint,
    }),
    WHATSAPP_CHANNEL_NOTE,
  ]
    .filter(Boolean)
    .join("\n");

  const sanitized = sanitizeForModel(uiMessages, input.branding);
  const modelMessages = await convertToModelMessages(sanitized);
  const tools = createWhatsAppChatTools({
    catalogDataset: input.catalogDataset,
    tenant: input.tenant,
    plainMessages,
  });

  const result = await generateText({
    model: createChatModel(input.tenant),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: isLoopFinished(),
  });

  const replyText = stripRichContentForWhatsApp(result.text);
  const assistantMessage: PersistedChatMessage = {
    id: generateId(),
    role: "assistant",
    text: replyText || "Sorry, I couldn't generate a response. Please try again.",
  };

  return {
    replyText: assistantMessage.text,
    messages: [...input.messages, assistantMessage],
  };
}
