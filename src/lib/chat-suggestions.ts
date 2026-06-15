import type { UIMessage } from "ai";
import { INTERJECTION_SUGGESTION_FALLBACKS, type InterjectionType } from "@/lib/interjection";
import type { SuggestionsContext } from "@/lib/suggestions";

export const chatQuickSuggestions = [
  "Help me find the right fit",
  "My back has been hurting",
  "Just browsing",
  "Show me popular picks",
];

export function getInterjectionSuggestionFallbacks(
  interjectionType: InterjectionType = "guide"
): string[] {
  return [...INTERJECTION_SUGGESTION_FALLBACKS[interjectionType]];
}

export async function fetchSuggestions(
  messages: UIMessage[],
  tenantToken: string,
  tenantKey: string,
  context?: SuggestionsContext
): Promise<string[]> {
  if (!messages.length || !tenantToken || !tenantKey) return [];

  const response = await fetch("/api/suggestions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-token": tenantToken,
    },
    body: JSON.stringify({ messages, tenantKey, context }),
  });

  if (!response.ok) {
    if (context?.mode && context.mode !== "follow-up") {
      return getProactiveSuggestionFallbacks(context.mode, context.interjectionType);
    }
    return [];
  }

  const payload = (await response.json()) as { suggestions?: string[] };
  const suggestions = Array.isArray(payload.suggestions)
    ? payload.suggestions.map(String).filter(Boolean).slice(0, 5)
    : [];
  if (suggestions.length > 0) return suggestions;

  if (context?.mode && context.mode !== "follow-up") {
    return getProactiveSuggestionFallbacks(context.mode, context.interjectionType);
  }
  return [];
}

export function getProactiveSuggestionFallbacks(
  mode: NonNullable<SuggestionsContext["mode"]>,
  interjectionType?: InterjectionType
): string[] {
  if (mode === "interjection") {
    return getInterjectionSuggestionFallbacks(interjectionType);
  }
  if (mode === "new-session") {
    return ["Help me pick a mattress", "Show bestsellers", "Just browsing"];
  }
  if (mode === "reengagement") {
    return ["Yes, show me", "Just browsing", "Help me find a store", "Talk to an agent"];
  }
  if (mode === "upsell") {
    return ["Show me protectors", "Other accessories", "I'm all set"];
  }
  return [];
}
