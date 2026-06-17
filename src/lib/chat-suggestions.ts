import type { UIMessage } from "ai";
import {
  getProactiveSuggestionFallbacks,
  type SuggestionsContext,
} from "@/lib/suggestions";

export const chatQuickSuggestions = [
  "Help me find the right fit",
  "My back has been hurting",
  "Just browsing",
  "Show me popular picks",
];

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
