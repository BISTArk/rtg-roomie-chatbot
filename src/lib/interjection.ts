import type { UIMessage } from "ai";
import type { BrowsingHistoryEntry, PageContext } from "@/lib/system-prompt";
import { parseAssistantMarkup } from "@/lib/assistant-html";
import { detectStageFromResponse, stripStageTag } from "@/lib/stage-tag";

export const INTERJECTION_MESSAGE_ID_PREFIX = "interjection-";

const TRANSIENT_STAGES = new Set([
  "new-session",
  "interjection",
  "contextual",
  "reengagement",
  "upsell",
]);

function getTextParts(message: UIMessage) {
  return message.parts.filter(
    (part): part is { type: "text"; text: string } => part.type === "text"
  );
}

function getTransientStageFromText(text: string): string | null {
  const detected = detectStageFromResponse(text.trim());
  if (detected && TRANSIENT_STAGES.has(detected)) return detected;

  const match = text.match(
    /\[STAGE:\s*(new-session|interjection|contextual|reengagement|upsell)\s*\]/i
  );
  return match ? match[1].toLowerCase() : null;
}

export function messageHasInterjectionStage(message: UIMessage): boolean {
  return getTextParts(message).some(
    (part) => getTransientStageFromText(part.text) === "interjection"
  );
}

export function createInterjectionMessageId(suffix?: string) {
  const id =
    suffix ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`);
  return `${INTERJECTION_MESSAGE_ID_PREFIX}${id}`;
}

export function isInterjectionMessage(messageOrId: UIMessage | string): boolean {
  if (typeof messageOrId === "string") {
    return messageOrId.includes(INTERJECTION_MESSAGE_ID_PREFIX);
  }

  return (
    messageOrId.id.includes(INTERJECTION_MESSAGE_ID_PREFIX) ||
    messageHasInterjectionStage(messageOrId)
  );
}

function getAssistantText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function hasProductSearchOutput(message: UIMessage): boolean {
  return message.parts.some((part) => {
    if (part.type !== "tool-product_search") return false;
    return (part as { state?: string }).state === "output-available";
  });
}

/** Whether a proactive message has content worth showing in the closed-state bubble. */
export function hasProactiveBubbleContent(message: UIMessage): boolean {
  const text = stripStageTag(getAssistantText(message)).trim();
  const parsed = text ? parseAssistantMarkup(text) : null;
  if (parsed?.prose || (parsed?.actions.length ?? 0) > 0) return true;
  return hasProductSearchOutput(message);
}

/** Transient proactive assistant messages shown as closed-state bubbles. */
export function isTransientProactiveMessage(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.id === "welcome") return false;
  if (message.id.includes(INTERJECTION_MESSAGE_ID_PREFIX)) return true;
  return getTextParts(message).some(
    (part) => getTransientStageFromText(part.text) != null
  );
}

function isTransientAssistantMessage(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.id === "welcome") return true;
  if (message.id.includes(INTERJECTION_MESSAGE_ID_PREFIX)) return true;
  return getTextParts(message).some(
    (part) => getTransientStageFromText(part.text) != null
  );
}

export function shouldMergeAssistantMessages(previous: UIMessage, message: UIMessage) {
  if (message.role !== "assistant" || previous.role !== "assistant") return false;
  if (isTransientAssistantMessage(previous) || isTransientAssistantMessage(message)) {
    return false;
  }
  return true;
}

export function splitTransientAssistantMessages(messages: UIMessage[]): UIMessage[] {
  const split: UIMessage[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") {
      split.push(message);
      continue;
    }

    const segments: Array<{ parts: UIMessage["parts"]; stage: string | null }> = [];
    let currentParts: UIMessage["parts"] = [];

    for (const part of message.parts) {
      if (part.type === "text") {
        const stage = getTransientStageFromText(part.text);
        if (stage) {
          if (currentParts.length > 0) {
            segments.push({ parts: currentParts, stage: null });
            currentParts = [];
          }
          segments.push({ parts: [part], stage });
          continue;
        }
      }

      currentParts.push(part);
    }

    if (currentParts.length > 0) {
      segments.push({ parts: currentParts, stage: null });
    }

    if (segments.length <= 1) {
      const only = segments[0];
      if (only?.stage === "interjection") {
        split.push({
          ...message,
          id: isInterjectionMessage(message.id)
            ? message.id
            : createInterjectionMessageId(message.id),
          parts: only.parts,
        });
      } else {
        split.push(message);
      }
      continue;
    }

    segments.forEach((segment, index) => {
      const id =
        segment.stage === "interjection"
          ? createInterjectionMessageId(`${message.id}-${index}`)
          : index === 0
            ? message.id
            : `${message.id}-segment-${index}`;

      split.push({
        ...message,
        id,
        parts: segment.parts,
      });
    });
  }

  return split;
}

export const INTERJECTION_TYPES = [
  "guide",
  "compare",
  "inform",
  "social",
  "resume",
] as const;

export type InterjectionType = (typeof INTERJECTION_TYPES)[number];

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
