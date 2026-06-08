import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  isLoopFinished,
  streamText,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import {
  buildSystemPrompt,
  type VisitorProfile,
  type PageContext,
  type BrowsingHistoryEntry,
  type ConversationStage,
  type CustomerLocation,
} from "@/lib/system-prompt";
import {
  buildCatalogPlaceholder,
  formatRetrievedCatalog,
  getLastUserText,
  needsCatalogRetrieval,
  planCatalogIntent,
  queryCatalogFromRows,
  resolveCatalogMode,
} from "@/lib/catalog-retrieval";
import { inferStage, stripStageTag } from "@/lib/stage-tag";
import { stripUnresolvedToolParts } from "@/lib/message-tools";
import { isComplaintMessage } from "@/lib/complaint-detection";
import { getWelcomeMessage } from "@/lib/widget-config";
import type { WidgetBranding } from "@/lib/widget-config";
import { buildTenantCatalogContext, getActiveCatalogDataset, recordConversationAnalytics, resolveTenantFromToken } from "@/lib/tenant-platform";
import { chatTools } from "@/tools";

export const maxDuration = 60;

type CompareRequest = {
  shopperGoal?: string;
  products?: unknown[];
};

type ChatRequestBody = {
  id?: string;
  messages: UIMessage[];
  compareRequest?: CompareRequest;
  type?: "chat" | "returning" | "summarize" | "reengagement" | "contextual" | "new-session" | "interjection" | "upsell";
  interjectionType?: "compare" | "inform" | "guide" | "social" | "resume";
  pageContext?: PageContext;
  browsingHistory?: BrowsingHistoryEntry[];
  visitorProfile?: VisitorProfile;
  model?: string;
  branding?: Partial<WidgetBranding>;
  tenantKey?: string;
  sessionId?: string;
  hostOrigin?: string;
};

const MODEL_MAP: Record<string, string> = {
  "gemini-flash-3": "google/gemini-3-flash-preview",
  "claude-sonnet-4.6": "anthropic/claude-sonnet-4.6",
  "gpt-5.4": "openai/gpt-5.4",
};

const DEFAULT_MODEL = "gemini-flash-3";
const NO_ACTIVE_TENANT_CATALOG_MARKER = "(no active tenant catalog snapshot)";

function getTextFromUiMessage(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Pulls IP-inferred geolocation from Vercel's edge headers. Returns
 *  undefined when NO geo field is present (localhost, previews, bypassed
 *  requests) so the system prompt doesn't render an empty block. Vercel
 *  URL-encodes city names (e.g. "New%20York") so we decode defensively. */
function extractCustomerLocation(headers: Headers): CustomerLocation | undefined {
  const get = (k: string): string | undefined => {
    const v = headers.get(k);
    if (!v) return undefined;
    try { return decodeURIComponent(v).trim() || undefined; }
    catch { return v.trim() || undefined; }
  };
  const loc: CustomerLocation = {
    city: get("x-vercel-ip-city"),
    region: get("x-vercel-ip-country-region"),
    country: get("x-vercel-ip-country"),
    latitude: get("x-vercel-ip-latitude"),
    longitude: get("x-vercel-ip-longitude"),
    timezone: get("x-vercel-ip-timezone"),
  };
  const hasAny = loc.city || loc.region || loc.country || loc.latitude || loc.longitude || loc.timezone;
  return hasAny ? loc : undefined;
}

function sanitizeForModel(
  messages: UIMessage[],
  branding?: Partial<WidgetBranding>
): Omit<UIMessage, "id">[] {
  const hasWelcome = messages.some((m) => m.id === "welcome");
  const cleaned = stripUnresolvedToolParts(messages)
    .filter((m) => m.id !== "welcome")
    .map((m) => {
      const { id, ...rest } = m;
      void id;
      if (m.role !== "assistant") return rest as Omit<UIMessage, "id">;
      return {
        ...rest,
        parts: rest.parts.map((p) =>
          p.type === "text" ? { ...p, text: stripStageTag(p.text) } : p
        ),
      } as Omit<UIMessage, "id">;
    });

  // If the static welcome was in the messages, inject it as a synthetic
  // assistant message at the start so the AI knows it already greeted.
  // This prevents the double-intro ("I'm Shop Assist" twice).
  if (hasWelcome) {
    cleaned.unshift({
      role: "assistant",
      parts: [{ type: "text", text: getWelcomeMessage({
        assistantName: typeof branding?.assistantName === "string" && branding.assistantName.trim()
          ? branding.assistantName.trim()
          : "Shopping Assistant",
        launcherLabel: "",
        headerTitle: "",
        inputPlaceholder: "",
        humanModeBannerText: "",
        quickChips: [],
        logoMode: "none",
      }) }],
    } as Omit<UIMessage, "id">);
  }

  return cleaned;
}

function toPlainMessages(messages: UIMessage[]): Array<{ role: "user" | "assistant"; text: string }> {
  return messages.map((message) => ({
    role: message.role as "user" | "assistant",
    text: stripStageTag(getTextFromUiMessage(message)),
  }));
}

function hasActiveTenantCatalogSnapshot(catalogData: string): boolean {
  return !catalogData.includes(NO_ACTIVE_TENANT_CATALOG_MARKER);
}

function blockForMissingCatalog(
  stage: ConversationStage,
  catalogData: string
): boolean {
  if (hasActiveTenantCatalogSnapshot(catalogData)) {
    return false;
  }

  return needsCatalogRetrieval(stage) || stage === "contextual" || stage === "upsell";
}

function createMissingCatalogResponse(messages: UIMessage[]): Response {
  const textId = generateId();
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      writer.write({
        type: "start",
        messageId: generateId(),
      });
      writer.write({
        type: "text-start",
        id: textId,
      });
      writer.write({
        type: "text-delta",
        id: textId,
        delta:
          "I’m still syncing this store’s catalog, so I can’t recommend specific products or show product cards yet. Please try again after the Shopify catalog sync finishes.",
      });
      writer.write({
        type: "text-end",
        id: textId,
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function normalizeUsageCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function buildCompareRequestPrompt(compareRequest?: CompareRequest): string {
  if (!compareRequest?.products?.length) return "";

  return [
    "",
    "Pending client-side compare request:",
    "Write one short shopper-facing lead-in, then call compare_tool with these exact products. Include a recommendation when one option is clearly the best fit. The tool UI contains the full comparison and recommendation, so do not write any text after the tool returns.",
    JSON.stringify(compareRequest),
  ].join("\n");
}

function buildTrackedStreamResponse(input: {
  tenantId: string;
  sessionId?: string;
  hostOrigin?: string;
  requestType: string;
  stage?: ConversationStage | null;
  modelKey: string;
  modelId: string;
  inputMessageCount: number;
  streamArgs: Parameters<typeof streamText>[0];
}): Response {
  const result = streamText({
    ...input.streamArgs,
    tools: chatTools,
    stopWhen: isLoopFinished(),
    onFinish: async (event) => {
      if (!input.sessionId) return;
      const usage: LanguageModelUsage = event.totalUsage;
      await recordConversationAnalytics({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        requestType: input.requestType,
        conversationStage: input.stage || null,
        modelKey: input.modelKey,
        modelId: event.model.modelId || input.modelId,
        providerId: event.model.provider || null,
        inputMessageCount: input.inputMessageCount,
        promptTokens: normalizeUsageCount(usage.inputTokens),
        completionTokens: normalizeUsageCount(usage.outputTokens),
        totalTokens: normalizeUsageCount(usage.totalTokens),
        responseCharCount: event.text.length,
        finishReason: event.finishReason,
        status: event.finishReason === "error" ? "error" : "completed",
        hostOrigin: input.hostOrigin,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    onError: () => "Something went wrong.",
  });
}

async function resolveCatalogForStage(input: {
  tenantId: string;
  stage: ConversationStage;
  type?: ChatRequestBody["type"];
  plannerModel: Parameters<typeof planCatalogIntent>[0]["model"];
  plainMessages: Array<{ role: "user" | "assistant"; text: string }>;
  pageContext?: PageContext;
  browsingHistory?: BrowsingHistoryEntry[];
  visitorProfile?: VisitorProfile;
}) {
  if (input.type === "upsell" || input.stage === "closing") {
    return {
      catalogData: buildCatalogPlaceholder("No main mattress catalog rows were injected for this turn. Use the accessory subset below for cross-sell decisions."),
      accessoryData: (await buildTenantCatalogContext(input.tenantId, input.pageContext?.cartItems)).accessoryData,
    };
  }

  if (input.stage === "contextual") {
    return {
      catalogData: (await buildTenantCatalogContext(input.tenantId, input.pageContext?.cartItems)).catalogData,
    };
  }

  if (!needsCatalogRetrieval(input.stage)) {
    return {
      catalogData: buildCatalogPlaceholder(),
    };
  }

  const mode = resolveCatalogMode(process.env.CATALOG_MODE);
  if (mode === "full") {
    const runtimeCatalog = await buildTenantCatalogContext(
      input.tenantId,
      input.pageContext?.cartItems
    );
    return {
      catalogData: runtimeCatalog.catalogData,
      accessoryData: runtimeCatalog.accessoryData,
      retrievalMeta: {
        intentSummary: `tenant_full_catalog:${getLastUserText(input.plainMessages) || "n/a"}`,
        sql: "tenant_catalog_snapshot",
        rowCount: runtimeCatalog.catalogData.includes("(none)") ? 0 : undefined,
        relaxed: false,
        filterSummary: "full_catalog=yes",
      },
    };
  }

  const dataset = await getActiveCatalogDataset(input.tenantId);
  if (!dataset || dataset.rows.length === 0) {
    return {
      catalogData: "# RETRIEVED CATALOG CONTEXT\n\n(no active tenant catalog snapshot)\n\n## CATALOG DATA\n\n(none)",
      retrievalMeta: {
        intentSummary: "retrieval_mode:no_active_catalog",
        sql: "-- skipped",
        rowCount: 0,
        relaxed: false,
        filterSummary: "active_catalog=no",
      },
    };
  }

  const intent = await planCatalogIntent({
    model: input.plannerModel,
    stage: input.stage,
    messages: input.plainMessages,
    pageContext: input.pageContext,
    browsingHistory: input.browsingHistory,
  });

  const execution = await queryCatalogFromRows(dataset.rows, intent, {
    stage: input.stage,
    rawUserRequest: getLastUserText(input.plainMessages),
    pageContext: input.pageContext,
    browsingHistory: input.browsingHistory,
    visitorProfile: input.visitorProfile,
  });

  return {
    catalogData: formatRetrievedCatalog(execution, { intent }),
    retrievalMeta: {
      intentSummary: intent.intent_summary,
      sql: execution.sql,
      rowCount: execution.rows.length,
      relaxed: execution.relaxed,
      filterSummary: execution.appliedFilters.length > 0 ? execution.appliedFilters.join("; ") : "(none)",
    },
  };
}

export async function POST(request: Request) {
  console.log("[chat route] ── POST handler entered ──");

  const apiKey = process.env.OPENROUTER_API_KEY;
  console.log("[chat route] OPENROUTER_API_KEY present:", !!apiKey);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing OPENROUTER_API_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
    console.log("[chat route] body parsed OK — type:", body.type, "messages:", body.messages?.length ?? 0, "model:", body.model);
  } catch (parseErr) {
    console.error("[chat route] body parse FAILED:", parseErr);
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const {
    messages = [],
    compareRequest,
    type,
    pageContext: rawPageContext,
    browsingHistory,
    visitorProfile,
    model,
    interjectionType,
    branding,
    tenantKey,
    sessionId,
    hostOrigin,
  } = body;

  // IP-inferred geolocation from Vercel edge headers (free, no external call).
  const customerLocation = extractCustomerLocation(request.headers);
  console.log("[chat route] customerLocation:", customerLocation ? `${customerLocation.city}, ${customerLocation.region}, ${customerLocation.country}` : "absent");

  // Merge browsing history into page context so it reaches the system prompt
  const pageContext: PageContext | undefined = rawPageContext
    ? { ...rawPageContext, browsingHistory: browsingHistory || rawPageContext.browsingHistory }
    : undefined;
  console.log("[chat route] pageContext:", pageContext ? `page=${pageContext.page} product=${pageContext.productName || '(none)'} cartItems=${pageContext.cartItems?.length ?? 0}` : "absent");
  const plainMessages = toPlainMessages(messages);

  const modelKey = model || DEFAULT_MODEL;
  const modelId = MODEL_MAP[modelKey] ?? MODEL_MAP[DEFAULT_MODEL];
  console.log("[chat route] model:", modelKey, "→", modelId);

  let tenant;
  try {
    tenant = await resolveTenantFromToken(
      String(tenantKey || "").trim() || "shop-assist-demo",
      request.headers.get("x-tenant-token")
    );
  } catch (error) {
    console.error("[chat route] tenant resolution failed:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Tenant resolution failed",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const openrouter = createOpenRouter({
    apiKey,
    appName: tenant.appName,
    appUrl: tenant.appUrl,
  });
  console.log("[chat route] openrouter client created");
  const chatModel = openrouter.chat(modelId);
  console.log("[chat route] tenant:", tenant.tenantKey, tenant.tenantId);

  try {
    console.log("[chat route] entering try block — type:", type);

    if (type === "summarize" && messages.length > 0) {
      console.log("[chat route] → summarize path");
      return buildTrackedStreamResponse({
        tenantId: tenant.tenantId,
        sessionId,
        hostOrigin,
        requestType: "summarize",
        modelKey,
        modelId,
        inputMessageCount: messages.length,
        streamArgs: {
          model: chatModel,
          system: "You are a helpful assistant. Complete this phrase naturally in under 15 words, describing what the customer was looking for based on the conversation: 'looking for...'. Start directly with 'looking for' and end with a period. Do not include any preamble.",
          messages: [
            {
              role: "user",
              content: `Summarize this conversation:\n${messages
                .filter((m) => m.id !== "welcome")
                .map((m) => `${m.role}: ${m.parts.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("")}`)
                .join("\n")}`,
            },
          ],
        },
      });
    }

    if (type === "returning" && visitorProfile) {
      console.log("[chat route] → returning path");
      const retrieval = await resolveCatalogForStage({
        tenantId: tenant.tenantId,
        plannerModel: chatModel,
        stage: "returning",
        type,
        plainMessages,
        pageContext: pageContext ?? undefined,
        browsingHistory: browsingHistory ?? undefined,
        visitorProfile,
      });
      console.log("[chat route] retrieval:", retrieval.retrievalMeta ?? "skipped");
      console.log("[chat route] catalog prompt length:", retrieval.catalogData.length, "chars");
      const systemPrompt = buildSystemPrompt(retrieval.catalogData, "returning", {
        systemPrompt: tenant.systemPrompt,
        skillPrompt: tenant.skillPrompts.returning,
        visitorProfile,
        pageContext: pageContext ?? undefined,
        customerLocation,
      });
      // Include prior chat history (if any) so the AI can reference the
      // last topic. Always append a trigger message so the AI generates
      // (an assistant-ended history alone would produce empty output).
      const sanitized = sanitizeForModel(messages, branding);
      const modelMessages = await convertToModelMessages(sanitized);
      return buildTrackedStreamResponse({
        tenantId: tenant.tenantId,
        sessionId,
        hostOrigin,
        requestType: "returning",
        stage: "returning",
        modelKey,
        modelId,
        inputMessageCount: messages.length,
        streamArgs: {
          model: chatModel,
          system: systemPrompt,
          messages: [
            ...modelMessages,
            {
              role: "user",
              content: `Generate a welcome-back greeting NOW following the returning skill. ${modelMessages.length > 0 ? "Reference one concrete detail from the chat history above." : "The visitor has no prior chat history this session but has visited the site before."} ${pageContext?.cartItems && pageContext.cartItems.length > 0 ? `IMPORTANT: The customer already has items in their cart (${pageContext.cartItems.join("; ")}). Use the "Cart has items — lead with it" template at the top of the returning skill. Lead with checkout as the primary CTA. Do NOT use any of the other templates.` : "The cart is empty; pick the best-matching template based on visitor profile."} Visitor profile: ${JSON.stringify(visitorProfile)}`,
            },
          ],
        },
      });
    }

    // State 1: Re-engagement after 20min idle. Uses full chat history for the
    // summary, plus the reengagement skill for phrasing.
    if (type === "reengagement") {
      console.log("[chat route] → reengagement path");
      const retrieval = await resolveCatalogForStage({
        tenantId: tenant.tenantId,
        plannerModel: chatModel,
        stage: "reengagement",
        type,
        plainMessages,
        pageContext: pageContext ?? undefined,
        browsingHistory: browsingHistory ?? undefined,
        visitorProfile: visitorProfile ?? undefined,
      });
      console.log("[chat route] retrieval:", retrieval.retrievalMeta ?? "skipped");
      console.log("[chat route] catalog prompt length:", retrieval.catalogData.length, "chars");
      const systemPrompt = buildSystemPrompt(retrieval.catalogData, "reengagement", {
        systemPrompt: tenant.systemPrompt,
        skillPrompt: tenant.skillPrompts.reengagement,
        visitorProfile: visitorProfile ?? undefined,
        pageContext: pageContext ?? undefined,
        customerLocation,
      });
      const sanitized = sanitizeForModel(messages, branding);
      const modelMessages = await convertToModelMessages(sanitized);
      // Always append a trigger so the AI generates something — existing
      // history alone ends with an assistant turn and produces empty output.
      return buildTrackedStreamResponse({
        tenantId: tenant.tenantId,
        sessionId,
        hostOrigin,
        requestType: "reengagement",
        stage: "reengagement",
        modelKey,
        modelId,
        inputMessageCount: messages.length,
        streamArgs: {
          model: chatModel,
          system: systemPrompt,
          messages: [
            ...modelMessages,
            {
              role: "user",
              content: "The customer is back after 20 minutes of idle. Generate the re-engagement message now, following the reengagement skill.",
            },
          ],
        },
      });
    }

    // State 2: Contextual product commentary (chat open, navigated to PDP,
    // dwelled 5+ seconds, not within cooldown). Uses the contextual skill.
    if (type === "contextual" && pageContext) {
      console.log("[chat route] → contextual path, product:", pageContext.productName);
      const retrieval = await resolveCatalogForStage({
        tenantId: tenant.tenantId,
        plannerModel: chatModel,
        stage: "contextual",
        type,
        plainMessages,
        pageContext,
        browsingHistory: browsingHistory ?? undefined,
        visitorProfile: visitorProfile ?? undefined,
      });
      console.log("[chat route] retrieval:", retrieval.retrievalMeta ?? "skipped");
      console.log("[chat route] catalog prompt length:", retrieval.catalogData.length, "chars");
      if (blockForMissingCatalog("contextual", retrieval.catalogData)) {
        console.warn("[chat route] blocking contextual response because tenant catalog is missing");
        if (sessionId) {
          await recordConversationAnalytics({
            tenantId: tenant.tenantId,
            sessionId,
            requestType: "contextual",
            conversationStage: "contextual",
            modelKey,
            modelId,
            inputMessageCount: messages.length,
            status: "blocked",
            errorText: "Tenant catalog missing for contextual response.",
            hostOrigin,
          });
        }
        return createMissingCatalogResponse(messages);
      }
      const systemPrompt = buildSystemPrompt(retrieval.catalogData, "contextual", {
        systemPrompt: tenant.systemPrompt,
        skillPrompt: tenant.skillPrompts.contextual,
        visitorProfile: visitorProfile ?? undefined,
        pageContext,
      });
      const sanitized = sanitizeForModel(messages, branding);
      const modelMessages = await convertToModelMessages(sanitized);
      return buildTrackedStreamResponse({
        tenantId: tenant.tenantId,
        sessionId,
        hostOrigin,
        requestType: "contextual",
        stage: "contextual",
        modelKey,
        modelId,
        inputMessageCount: messages.length,
        streamArgs: {
          model: chatModel,
          system: systemPrompt,
          messages: [
            ...modelMessages,
            {
              role: "user",
              content: `The customer just landed on the product page for "${pageContext.productName || "a product"}"${pageContext.productPrice ? ` (${pageContext.productPrice})` : ""}. Generate the contextual commentary NOW, following the contextual skill. Keep it under 25 words.`,
            },
          ],
        },
      });
    }

    // State 4: first-time-visitor greeting (no prior chat history). Uses the
    // new-session skill which is light — intro + stand by for user input.
    if (type === "new-session") {
      console.log("[chat route] → new-session path");
      const retrieval = await resolveCatalogForStage({
        tenantId: tenant.tenantId,
        plannerModel: chatModel,
        stage: "new-session",
        type,
        plainMessages,
        pageContext: pageContext ?? undefined,
        browsingHistory: browsingHistory ?? undefined,
        visitorProfile: visitorProfile ?? undefined,
      });
      console.log("[chat route] retrieval:", retrieval.retrievalMeta ?? "skipped");
      console.log("[chat route] catalog prompt length:", retrieval.catalogData.length, "chars");
      const systemPrompt = buildSystemPrompt(retrieval.catalogData, "new-session", {
        systemPrompt: tenant.systemPrompt,
        skillPrompt: tenant.skillPrompts["new-session"],
        visitorProfile: visitorProfile ?? undefined,
        pageContext: pageContext ?? undefined,
        customerLocation,
      });
      const sanitized = sanitizeForModel(messages, branding);
      const modelMessages = await convertToModelMessages(sanitized);
      return buildTrackedStreamResponse({
        tenantId: tenant.tenantId,
        sessionId,
        hostOrigin,
        requestType: "new-session",
        stage: "new-session",
        modelKey,
        modelId,
        inputMessageCount: messages.length,
        streamArgs: {
          model: chatModel,
          system: systemPrompt,
          messages: [
            ...modelMessages,
            {
              role: "user",
              content:
                modelMessages.length > 0
                  ? "Generate the one-time new-session greeting bubble now. Use short prose plus the required action tiles from the skill."
                  : "The customer just arrived on the site for a fresh session (no chat history). Generate the one-time greeting.",
            },
          ],
        },
      });
    }

    // State 3: BROWSING_CHAT_CLOSED interjection. Subtype tells the skill
    // which sub-template to use (compare/inform/guide/social/resume).
    if (type === "interjection" && interjectionType) {
      console.log("[chat route] → interjection path, subtype:", interjectionType);
      const retrieval = await resolveCatalogForStage({
        tenantId: tenant.tenantId,
        plannerModel: chatModel,
        stage: "interjection",
        type,
        plainMessages,
        pageContext: pageContext ?? undefined,
        browsingHistory: browsingHistory ?? undefined,
        visitorProfile: visitorProfile ?? undefined,
      });
      console.log("[chat route] retrieval:", retrieval.retrievalMeta ?? "skipped");
      console.log("[chat route] catalog prompt length:", retrieval.catalogData.length, "chars");
      const systemPrompt = buildSystemPrompt(retrieval.catalogData, "interjection", {
        systemPrompt: tenant.systemPrompt,
        skillPrompt: tenant.skillPrompts.interjection,
        visitorProfile: visitorProfile ?? undefined,
        pageContext: pageContext ?? undefined,
        customerLocation,
        interjectionType,
      });
      const sanitized = sanitizeForModel(messages, branding);
      const modelMessages = await convertToModelMessages(sanitized);
      return buildTrackedStreamResponse({
        tenantId: tenant.tenantId,
        sessionId,
        hostOrigin,
        requestType: "interjection",
        stage: "interjection",
        modelKey,
        modelId,
        inputMessageCount: messages.length,
        streamArgs: {
          model: chatModel,
          system: systemPrompt,
          messages: [
            ...modelMessages,
            {
              role: "user",
              content: `Generate an interjection of type "${interjectionType}" NOW, following the interjection skill's "${interjectionType}" sub-template. The customer has been browsing with the chat closed.

IMPORTANT context to weave in:
- Scan the full chat history above for prior preferences, questions, or pain points the customer mentioned (sleep position, temperature, budget, back pain, partner, etc.). Reference one concrete detail if present.
- Scan the BROWSING HISTORY section of your system prompt for specific products the customer has viewed during this session. Name the most-relevant one explicitly if it fits the interjection type (especially "compare", "inform", "social", "resume").
- Scan the SHOPIFY CART STATUS section for what's already in the cart. NEVER re-suggest what they already have.
- Avoid repeating any category or phrasing you've used in a prior [STAGE:interjection] message in this conversation.`,
            },
          ],
        },
      });
    }

    // Post-Add-to-Cart cross-sell. Fires after a successful cart action.
    // Uses the upsell skill — one short suggestion + tiles. Capped at 2
    // invocations per session by the client.
    if (type === "upsell") {
      const retrieval = await resolveCatalogForStage({
        tenantId: tenant.tenantId,
        plannerModel: chatModel,
        stage: "upsell",
        type,
        plainMessages,
        pageContext: pageContext ?? undefined,
        browsingHistory: browsingHistory ?? undefined,
        visitorProfile: visitorProfile ?? undefined,
      });
      console.log("[chat route] retrieval:", retrieval.retrievalMeta ?? "skipped");
      console.log("[chat route] catalog prompt length:", retrieval.catalogData.length, "chars");
      console.log("[chat route] accessory prompt length:", retrieval.accessoryData?.length ?? 0, "chars");
      if (blockForMissingCatalog("upsell", retrieval.catalogData)) {
        console.warn("[chat route] blocking upsell response because tenant catalog is missing");
        if (sessionId) {
          await recordConversationAnalytics({
            tenantId: tenant.tenantId,
            sessionId,
            requestType: "upsell",
            conversationStage: "upsell",
            modelKey,
            modelId,
            inputMessageCount: messages.length,
            status: "blocked",
            errorText: "Tenant catalog missing for upsell response.",
            hostOrigin,
          });
        }
        return createMissingCatalogResponse(messages);
      }
      const systemPrompt = buildSystemPrompt(retrieval.catalogData, "upsell", {
        systemPrompt: tenant.systemPrompt,
        skillPrompt: tenant.skillPrompts.upsell,
        visitorProfile: visitorProfile ?? undefined,
        pageContext: pageContext ?? undefined,
        customerLocation,
        accessoryData: retrieval.accessoryData,
      });
      const sanitized = sanitizeForModel(messages, branding);
      const modelMessages = await convertToModelMessages(sanitized);

      // Build an explicit exclusion list so the AI can't blindly suggest
      // an accessory the customer already has.
      const cartList = pageContext?.cartItems && pageContext.cartItems.length > 0
        ? pageContext.cartItems.join("; ")
        : "";
      const exclusionLine = cartList
        ? `\n\nThe cart already contains: ${cartList}. Do NOT suggest any of these items — pick a DIFFERENT complementary category.`
        : "";

      // Also tell the AI to scan prior assistant messages with [STAGE:upsell]
      // in this conversation and avoid repeating those categories.
      const repeatLine = `\n\nScan your previous assistant messages in this conversation. Follow the fixed category order: Lifestyle Base → Mattress Protector → Pillow → Sheets. If you've already suggested Lifestyle Base, move to Protector. If Protector, move to Pillow. If Pillow, move to Sheets. Never repeat the same category twice in the same session. If a category's catalog section is empty (notably SHEETS), skip it silently — never invent products.`;
      return buildTrackedStreamResponse({
        tenantId: tenant.tenantId,
        sessionId,
        hostOrigin,
        requestType: "upsell",
        stage: "upsell",
        modelKey,
        modelId,
        inputMessageCount: messages.length,
        streamArgs: {
          model: chatModel,
          system: systemPrompt,
          messages: [
            ...modelMessages,
            {
              role: "user",
              content: `The customer just added ${pageContext?.productName || "a mattress"} to their cart. Generate ONE short cross-sell suggestion NOW, following the upsell skill. Pick the single best complementary item based on the chat history and current product.${exclusionLine}${repeatLine}`,
            },
          ],
        },
      });
    }

    // Complaint override: if the user's latest message contains complaint
    // signals (return / defect / refund / strong frustration), force the
    // complaint stage so skills/complaint.md loads immediately — don't
    // wait for the AI to self-route via the system prompt's override. This
    // prevents a turn of "recommendation" or "discovery" behavior firing
    // on top of a complaint message.
    const lastUser = [...plainMessages].reverse().find((m) => m.role === "user");
    const userSaidComplaint = lastUser ? isComplaintMessage(lastUser.text) : false;
    const currentStage: ConversationStage = userSaidComplaint
      ? "complaint"
      : inferStage(plainMessages);

    const retrieval = await resolveCatalogForStage({
      tenantId: tenant.tenantId,
      plannerModel: chatModel,
      stage: currentStage,
      type,
      plainMessages,
      pageContext: pageContext ?? undefined,
      browsingHistory: browsingHistory ?? undefined,
      visitorProfile: visitorProfile ?? undefined,
    });
    console.log("[chat route] retrieval:", retrieval.retrievalMeta ?? "skipped");
    console.log("[chat route] catalog prompt length:", retrieval.catalogData.length, "chars");
    console.log("[chat route] accessory prompt length:", retrieval.accessoryData?.length ?? 0, "chars");
    if (blockForMissingCatalog(currentStage, retrieval.catalogData)) {
      console.warn("[chat route] blocking response because tenant catalog is missing for stage:", currentStage);
      if (sessionId) {
        await recordConversationAnalytics({
          tenantId: tenant.tenantId,
          sessionId,
          requestType: type || "chat",
          conversationStage: currentStage,
          modelKey,
          modelId,
          inputMessageCount: messages.length,
          status: "blocked",
          errorText: `Tenant catalog missing for ${currentStage} response.`,
          hostOrigin,
        });
      }
      return createMissingCatalogResponse(messages);
    }

    const systemPrompt = [
      buildSystemPrompt(retrieval.catalogData, currentStage, {
        systemPrompt: tenant.systemPrompt,
        skillPrompt: tenant.skillPrompts[currentStage],
        visitorProfile: visitorProfile ?? undefined,
        pageContext: pageContext ?? undefined,
        customerLocation,
        accessoryData: retrieval.accessoryData,
      }),
      buildCompareRequestPrompt(compareRequest),
    ]
      .filter(Boolean)
      .join("\n");

    const sanitized = sanitizeForModel(messages, branding);
    const modelMessages = await convertToModelMessages(sanitized);

    return buildTrackedStreamResponse({
      tenantId: tenant.tenantId,
      sessionId,
      hostOrigin,
      requestType: type || "chat",
      stage: currentStage,
      modelKey,
      modelId,
      inputMessageCount: messages.length,
      streamArgs: {
        model: chatModel,
        system: systemPrompt,
        messages: modelMessages,
      },
    });
  } catch (err) {
    console.error("[chat route]:", err);
    if (tenant && sessionId) {
      await recordConversationAnalytics({
        tenantId: tenant.tenantId,
        sessionId,
        requestType: type || "chat",
        modelKey,
        modelId,
        inputMessageCount: messages.length,
        status: "error",
        errorText: err instanceof Error ? err.message : "Chat request failed",
        hostOrigin,
      });
    }
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Chat request failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
