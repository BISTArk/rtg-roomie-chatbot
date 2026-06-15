import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output, type UIMessage } from "ai";
import { z } from "zod";
import {
  INTERJECTION_SUGGESTION_FALLBACKS,
  PROACTIVE_SUGGESTION_FALLBACKS,
  type InterjectionType,
  type ProactiveSuggestionMode,
} from "@/lib/interjection";
import type { BrowsingHistoryEntry, PageContext } from "@/lib/system-prompt";

const SUGGESTIONS_MODEL = "openai/gpt-5.4-nano";

export type SuggestionsMode =
  | "follow-up"
  | "interjection"
  | ProactiveSuggestionMode
  | "reengagement"
  | "upsell";

export type SuggestionsContext = {
  mode?: SuggestionsMode;
  interjectionType?: InterjectionType;
  pageContext?: PageContext;
  browsingHistory?: BrowsingHistoryEntry[];
  assistantMessage?: string;
};

const INTERJECTION_SUGGESTION_RULES: Record<InterjectionType, string> = {
  compare:
    'Generate exactly 3 chips for someone comparing products. Include options like side-by-side compare, help deciding, and a low-pressure "just browsing" exit.',
  inform:
    "Generate exactly 3 chips for someone on a product page. Include learn more about the product, sizes/pricing, and a polite exit.",
  guide:
    "Generate exactly 3 chips for a new browser with no product views yet. Include start narrowing down, bestsellers, and just browsing.",
  social:
    "Generate exactly 3 chips for someone who viewed one product. Include accessories, compare similar picks, and just browsing.",
  resume:
    "Generate exactly 4 chips for someone with prior chat history. Include continue the conversation, just browsing, find a store, and talk to an agent. Do not include start fresh.",
};

const PROACTIVE_SUGGESTION_RULES: Record<
  ProactiveSuggestionMode | "reengagement" | "upsell",
  string
> = {
  "new-session":
    "Generate exactly 3 chips for a first-time visitor. Include help picking a mattress, bestsellers, and just browsing.",
  reengagement:
    "Generate exactly 4 chips for a returning shopper. Include continue the conversation, just browsing, find a store, and talk to an agent.",
  upsell:
    "Generate exactly 3 chips after add-to-cart. Include the most relevant next accessory category, another accessory option, and an I'm all set exit.",
};

const SHARED_CHIP_RULES = [
  "Rules:",
  "- Each chip is the exact text sent when tapped.",
  "- Max 40 chars each.",
  "- Start with a verb or short action phrase when possible.",
  "- No punctuation at end.",
  "- No full sentences.",
  "- Ultra compact.",
  "- Never re-suggest items already in the cart.",
];

function buildTranscript(messages: UIMessage[]): string {
  return messages
    .slice(-8)
    .map((message) => {
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
      return `${message.role}: ${text}`;
    })
    .join("\n\n")
    .slice(-12000);
}

function buildBrowsingSummary(browsingHistory: BrowsingHistoryEntry[] = []): string {
  if (browsingHistory.length === 0) return "No products viewed yet.";
  return browsingHistory
    .slice(-6)
    .map((entry) => `- ${entry.productName}${entry.productPrice ? ` (${entry.productPrice})` : ""}`)
    .join("\n");
}

function buildPageSummary(pageContext?: PageContext): string {
  if (!pageContext) return "Unknown page.";
  const parts = [`Page: ${pageContext.page}`];
  if (pageContext.productName) parts.push(`Product: ${pageContext.productName}`);
  if (pageContext.category) parts.push(`Category: ${pageContext.category}`);
  if (pageContext.cartCount != null) parts.push(`Cart items: ${pageContext.cartCount}`);
  return parts.join("\n");
}

function buildProactivePrompt(input: {
  messages: UIMessage[];
  context: SuggestionsContext;
}): string {
  const mode = input.context.mode || "follow-up";
  const assistantMessage = input.context.assistantMessage?.trim() || "";
  const transcript = buildTranscript(input.messages);
  const browsingSummary = buildBrowsingSummary(input.context.browsingHistory);
  const pageSummary = buildPageSummary(input.context.pageContext);

  if (mode === "interjection") {
    const interjectionType = input.context.interjectionType || "guide";
    return [
      "Generate follow-up action chips for a proactive interjection while the chat widget is closed.",
      INTERJECTION_SUGGESTION_RULES[interjectionType],
      ...SHARED_CHIP_RULES,
      "- Match the interjection type intent.",
      "- Use browsing history and page context when naming products or actions.",
      "",
      `Interjection type: ${interjectionType}`,
      assistantMessage ? `Interjection message: ${assistantMessage}` : "",
      "",
      "Current page:",
      pageSummary,
      "",
      "Browsing history:",
      browsingSummary,
      "",
      "Conversation so far:",
      transcript,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const proactiveMode = mode as ProactiveSuggestionMode | "reengagement" | "upsell";
  return [
    `Generate follow-up action chips for a ${proactiveMode} assistant message.`,
    PROACTIVE_SUGGESTION_RULES[proactiveMode],
    ...SHARED_CHIP_RULES,
    "- Match the assistant message intent.",
    "- Use browsing history and page context when relevant.",
    "",
    assistantMessage ? `Assistant message: ${assistantMessage}` : "",
    "",
    "Current page:",
    pageSummary,
    "",
    "Browsing history:",
    browsingSummary,
    "",
    "Conversation so far:",
    transcript,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFollowUpPrompt(messages: UIMessage[]): string {
  return [
    "Generate 3-5 follow-up actions for this mattress shopper.",
    "Rules: max 40 chars each, start with a verb, no punctuation at end, no full sentences, ultra compact.",
    "Good examples: 'Compare top two', 'Show more Queen options', 'Find under $1500', 'Help with back pain', 'See cooling picks'",
    "Bad examples: 'Would you like me to compare these mattresses?', 'Explore our full selection of sleep products'",
    "",
    buildTranscript(messages),
  ].join("\n");
}

export function getInterjectionSuggestionFallbacks(
  interjectionType: InterjectionType = "guide"
): string[] {
  return [...INTERJECTION_SUGGESTION_FALLBACKS[interjectionType]];
}

export function getProactiveSuggestionFallbacks(
  mode: SuggestionsMode,
  interjectionType?: InterjectionType
): string[] {
  if (mode === "interjection") {
    return getInterjectionSuggestionFallbacks(interjectionType);
  }
  if (mode === "new-session" || mode === "reengagement" || mode === "upsell") {
    return [...PROACTIVE_SUGGESTION_FALLBACKS[mode]];
  }
  return [];
}

export async function generateSuggestions(
  messages: UIMessage[],
  context?: SuggestionsContext
): Promise<string[]> {
  const mode = context?.mode || "follow-up";
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || !messages.length) {
    return getProactiveSuggestionFallbacks(mode, context?.interjectionType);
  }

  const prompt =
    mode === "follow-up"
      ? buildFollowUpPrompt(messages)
      : buildProactivePrompt({ messages, context: context || {} });

  try {
    const result = await generateText({
      model: createOpenRouter({ apiKey }).chat(SUGGESTIONS_MODEL),
      prompt,
      output: Output.object({
        schema: z.object({
          suggestions: z.array(z.string().min(1).max(40)).min(3).max(5),
        }),
      }),
    });

    const suggestions = result.output?.suggestions;
    const normalized = Array.isArray(suggestions)
      ? suggestions.map(String).filter(Boolean).slice(0, 5)
      : [];

    if (normalized.length > 0) return normalized;

    return getProactiveSuggestionFallbacks(mode, context?.interjectionType);
  } catch {
    return getProactiveSuggestionFallbacks(mode, context?.interjectionType);
  }
}
