import type { UIMessage } from "ai";

export const chatQuickSuggestions = [
  "Help me find the right fit",
  "My back has been hurting",
  "Just browsing",
  "Show me popular picks",
];

export async function fetchSuggestions(
  messages: UIMessage[],
  tenantToken: string,
  tenantKey: string
): Promise<string[]> {
  if (!messages.length || !tenantToken || !tenantKey) return [];

  const response = await fetch("/api/suggestions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-token": tenantToken,
    },
    body: JSON.stringify({ messages, tenantKey }),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as { suggestions?: string[] };
  return Array.isArray(payload.suggestions)
    ? payload.suggestions.map(String).filter(Boolean).slice(0, 5)
    : [];
}
