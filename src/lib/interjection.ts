import type { UIMessage } from "ai";
import type { BrowsingHistoryEntry, PageContext } from "@/lib/system-prompt";
import { getScopedSessionKey } from "@/lib/browser-session";

export const INTERJECTION_MESSAGE_ID_PREFIX = "interjection-";
export const NEW_SESSION_MESSAGE_ID_PREFIX = "new-session-";
export const CONTEXTUAL_MESSAGE_ID_PREFIX = "contextual-";
export const REENGAGEMENT_MESSAGE_ID_PREFIX = "reengagement-";
export const UPSELL_MESSAGE_ID_PREFIX = "upsell-";

/** First three closed-chat interjections: 1 min, 3 min, 8 min from baseline. */
export const STATE3_THRESHOLDS_MS = [60_000, 180_000, 480_000] as const;
/** After the third interjection, wait 8 minutes between subsequent ones. */
export const STATE3_RECURRING_GAP_MS = 480_000;
/** Don't fire an interjection shortly after new-session or contextual peek. */
export const INTERJECTION_COOLDOWN_AFTER_PEEK_MS = 60_000;
export const STANDALONE_INTERJECTION_DELAY_MS = STATE3_THRESHOLDS_MS[0];

export const INTERJECTION_TYPES_USED_KEY = "interjection_types_used";

export function getInterjectionTypesUsedStorageKey(): string {
  return getScopedSessionKey(INTERJECTION_TYPES_USED_KEY);
}

const TRANSIENT_PROACTIVE_PREFIXES = [
  INTERJECTION_MESSAGE_ID_PREFIX,
  NEW_SESSION_MESSAGE_ID_PREFIX,
  CONTEXTUAL_MESSAGE_ID_PREFIX,
  REENGAGEMENT_MESSAGE_ID_PREFIX,
  UPSELL_MESSAGE_ID_PREFIX,
] as const;

const INTERJECTION_TYPE_PATTERN = /interjection-(guide|compare|inform|social|resume)-/;

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

export function createInterjectionMessageId(
  suffix?: string,
  type?: InterjectionType
) {
  const id =
    suffix ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`);
  if (type) {
    return `${INTERJECTION_MESSAGE_ID_PREFIX}${type}-${id}`;
  }
  return createProactiveId(INTERJECTION_MESSAGE_ID_PREFIX, id);
}

export function getInterjectionTypeFromMessage(
  message: UIMessage
): InterjectionType | null {
  if (!isInterjectionMessage(message)) return null;
  const match = message.id.match(INTERJECTION_TYPE_PATTERN);
  if (!match?.[1]) return null;
  return match[1] as InterjectionType;
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

export const INTERJECTION_DISMISSED_KEY = "interjection_dismissed";

function isInterjectionType(value: string): value is InterjectionType {
  return (INTERJECTION_TYPES as readonly string[]).includes(value);
}

export function rankInterjectionTypes(input: {
  pageContext: PageContext | null;
  messages: UIMessage[];
  browsingHistory: BrowsingHistoryEntry[];
}): InterjectionType[] {
  const userMessages = input.messages.filter((message) => message.role === "user");
  const productsViewed = input.browsingHistory.length;
  const isPdp =
    input.pageContext?.page === "pdp" && Boolean(input.pageContext.productName);

  const ranked: InterjectionType[] = [];
  if (userMessages.length >= 2) ranked.push("resume");
  if (isPdp) ranked.push("inform");
  if (productsViewed >= 2) ranked.push("compare");
  if (productsViewed === 1) ranked.push("social");
  ranked.push("guide");

  return [...new Set(ranked)];
}

export function readUsedInterjectionTypes(storageKey: string): InterjectionType[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is InterjectionType =>
      typeof entry === "string" && isInterjectionType(entry)
    );
  } catch {
    return [];
  }
}

export function recordUsedInterjectionType(
  storageKey: string,
  type: InterjectionType
): void {
  if (typeof window === "undefined") return;
  try {
    const used = readUsedInterjectionTypes(storageKey);
    if (!used.includes(type)) {
      used.push(type);
    }
    const trimmed = used.slice(-INTERJECTION_TYPES.length);
    sessionStorage.setItem(storageKey, JSON.stringify(trimmed));
  } catch {
    // noop
  }
}

export function pickInterjectionType(input: {
  pageContext: PageContext | null;
  messages: UIMessage[];
  browsingHistory: BrowsingHistoryEntry[];
  usedTypes?: InterjectionType[];
}): InterjectionType {
  const ranked = rankInterjectionTypes(input);
  const used = new Set(input.usedTypes ?? []);

  for (const type of ranked) {
    if (!used.has(type)) {
      return type;
    }
  }

  return ranked[0] ?? "guide";
}

export function buildInterjectionTriggerPrompt(input: {
  interjectionType: InterjectionType;
  pageContext?: PageContext;
  browsingHistory?: BrowsingHistoryEntry[];
}): string {
  const page = input.pageContext;
  const history = input.browsingHistory ?? page?.browsingHistory ?? [];
  const recentProducts = history
    .slice(0, 5)
    .map((entry) =>
      entry.productPrice
        ? `${entry.productName} (${entry.productPrice})`
        : entry.productName
    )
    .join("; ");

  const lines = [
    `Generate an interjection of type "${input.interjectionType}" NOW, following the interjection skill's "${input.interjectionType}" sub-template.`,
    "The customer has the chat closed. Output prose only for the peek bubble — no tools, no product cards.",
    "",
    "Use the context below together with the system prompt sections (CURRENT PAGE CONTEXT, BROWSING HISTORY, SHOPIFY CART STATUS, and chat history):",
    `- Current page: ${page?.page ?? "unknown"}`,
    page?.productName ? `- Current product: ${page.productName}` : null,
    page?.category ? `- Current category: ${page.category}` : null,
    page?.searchQuery ? `- Search query: ${page.searchQuery}` : null,
    page?.cartItems?.length
      ? `- Cart items: ${page.cartItems.join("; ")}`
      : "- Cart: empty",
    recentProducts ? `- Recently viewed: ${recentProducts}` : "- Recently viewed: none",
    "",
    "Rules:",
    "- Reference one concrete detail from chat history or browsing when it fits the subtype.",
    "- Name a specific viewed product when the subtype is compare, inform, social, or resume.",
    "- Never re-suggest items already in the cart.",
    "- Do not repeat phrasing from prior interjection messages in this conversation.",
    "- Stay under 30 words.",
  ].filter(Boolean);

  return lines.join("\n");
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
