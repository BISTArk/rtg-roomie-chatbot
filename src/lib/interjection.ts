import type { UIMessage } from "ai";
import type { BrowsingHistoryEntry, PageContext } from "@/lib/system-prompt";

export const INTERJECTION_MESSAGE_ID_PREFIX = "interjection-";
export const NEW_SESSION_MESSAGE_ID_PREFIX = "new-session-";
export const CONTEXTUAL_MESSAGE_ID_PREFIX = "contextual-";
export const REENGAGEMENT_MESSAGE_ID_PREFIX = "reengagement-";
export const UPSELL_MESSAGE_ID_PREFIX = "upsell-";

const TRANSIENT_PROACTIVE_PREFIXES = [
  INTERJECTION_MESSAGE_ID_PREFIX,
  NEW_SESSION_MESSAGE_ID_PREFIX,
  CONTEXTUAL_MESSAGE_ID_PREFIX,
  REENGAGEMENT_MESSAGE_ID_PREFIX,
  UPSELL_MESSAGE_ID_PREFIX,
] as const;

function getTextParts(message: UIMessage) {
  return message.parts.filter(
    (part): part is { type: "text"; text: string } => part.type === "text"
  );
}

export function getAssistantMessageText(message: UIMessage): string {
  return getTextParts(message)
    .map((part) => part.text)
    .join("")
    .trim();
}

function createProactiveId(prefix: string, suffix?: string): string {
  const id =
    suffix ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`);
  return `${prefix}${id}`;
}

export function createInterjectionMessageId(suffix?: string) {
  return createProactiveId(INTERJECTION_MESSAGE_ID_PREFIX, suffix);
}

export function createNewSessionMessageId(suffix?: string) {
  return createProactiveId(NEW_SESSION_MESSAGE_ID_PREFIX, suffix);
}

export function createContextualMessageId(suffix?: string) {
  return createProactiveId(CONTEXTUAL_MESSAGE_ID_PREFIX, suffix);
}

export function createReengagementMessageId(suffix?: string) {
  return createProactiveId(REENGAGEMENT_MESSAGE_ID_PREFIX, suffix);
}

export function createUpsellMessageId(suffix?: string) {
  return createProactiveId(UPSELL_MESSAGE_ID_PREFIX, suffix);
}

function hasTransientProactiveId(messageId: string): boolean {
  return TRANSIENT_PROACTIVE_PREFIXES.some((prefix) => messageId.includes(prefix));
}

export function isInterjectionMessage(message: UIMessage): boolean {
  return message.id.includes(INTERJECTION_MESSAGE_ID_PREFIX);
}

export function isNewSessionMessage(message: UIMessage): boolean {
  return message.id.includes(NEW_SESSION_MESSAGE_ID_PREFIX);
}

export function isContextualMessage(message: UIMessage): boolean {
  return message.id.includes(CONTEXTUAL_MESSAGE_ID_PREFIX);
}

/** Proactive peek bubbles that show prose + suggestion chips together. */
export function messageNeedsPeekSuggestions(message: UIMessage): boolean {
  return isInterjectionMessage(message) || isNewSessionMessage(message);
}

/** Transient proactive assistant messages shown as closed-state bubbles. */
export function isTransientProactiveMessage(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.id === "welcome") return false;
  return hasTransientProactiveId(message.id);
}

export function shouldMergeAssistantMessages(previous: UIMessage, message: UIMessage) {
  if (message.role !== "assistant" || previous.role !== "assistant") return false;
  if (isTransientProactiveMessage(previous) || isTransientProactiveMessage(message)) {
    return false;
  }
  return true;
}

export const INTERJECTION_TYPES = [
  "guide",
  "compare",
  "inform",
  "social",
  "resume",
] as const;

export type InterjectionType = (typeof INTERJECTION_TYPES)[number];

export const INTERJECTION_SUGGESTION_FALLBACKS: Record<InterjectionType, string[]> = {
  compare: ["Compare them side-by-side", "Help me decide", "Just browsing"],
  inform: ["Tell me more", "Check sizes and price", "I'm good thanks"],
  guide: ["Help me pick a mattress", "Show bestsellers", "Just browsing"],
  social: ["Show accessories", "Compare similar picks", "Just browsing"],
  resume: ["Yes, let's continue", "Just browsing", "Help me find a store", "Talk to an agent"],
};

export const PROACTIVE_SUGGESTION_FALLBACKS = {
  "new-session": ["Help me pick a mattress", "Show bestsellers", "Just browsing"],
  reengagement: ["Yes, show me", "Just browsing", "Help me find a store", "Talk to an agent"],
  upsell: ["Show me protectors", "Other accessories", "I'm all set"],
} as const;

export type ProactiveSuggestionMode = keyof typeof PROACTIVE_SUGGESTION_FALLBACKS;

export const STANDALONE_INTERJECTION_DELAY_MS = 8_000;
export const INTERJECTION_DISMISSED_KEY = "interjection_dismissed";

export function pickInterjectionType(input: {
  pageContext: PageContext | null;
  messages: UIMessage[];
  browsingHistory: BrowsingHistoryEntry[];
}): InterjectionType {
  const userMessages = input.messages.filter((message) => message.role === "user");
  const productsViewed = input.browsingHistory.length;
  const isPdp =
    input.pageContext?.page === "pdp" && Boolean(input.pageContext.productName);

  if (userMessages.length >= 2) return "resume";
  if (isPdp) return "inform";
  if (productsViewed >= 2) return "compare";
  if (productsViewed === 1) return "social";
  return "guide";
}

export function isInterjectionDismissed(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export function dismissInterjection(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, "1");
  } catch {
    // noop
  }
}

export function clearInterjectionDismissed(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // noop
  }
}

export function postInterjectionTrigger(interjectionType: InterjectionType) {
  if (typeof window === "undefined") return;
  window.postMessage(
    {
      type: "shop-assist-interjection",
      interjectionType,
    },
    "*"
  );
}
