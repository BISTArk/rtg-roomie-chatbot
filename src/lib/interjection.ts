import type { UIMessage } from "ai";
import type { BrowsingHistoryEntry, PageContext } from "@/lib/system-prompt";
import { detectStageFromResponse, stripStageTag } from "@/lib/stage-tag";

export const INTERJECTION_MESSAGE_ID_PREFIX = "interjection-";
export const COMMITTED_PROACTIVE_MESSAGE_ID_PREFIX = "proactive-";

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

/** Transient proactive assistant messages shown as closed-state bubbles. */
export function isTransientProactiveMessage(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.id === "welcome") return false;
  if (message.id.includes(INTERJECTION_MESSAGE_ID_PREFIX)) return true;
  return getTextParts(message).some(
    (part) => getTransientStageFromText(part.text) != null
  );
}

function promoteCommittedAssistantId(messageId: string): string {
  if (messageId.includes(COMMITTED_PROACTIVE_MESSAGE_ID_PREFIX)) {
    return messageId;
  }

  if (messageId.includes(INTERJECTION_MESSAGE_ID_PREFIX)) {
    const suffix = messageId.slice(INTERJECTION_MESSAGE_ID_PREFIX.length).trim();
    return suffix
      ? `${COMMITTED_PROACTIVE_MESSAGE_ID_PREFIX}${suffix}`
      : `${COMMITTED_PROACTIVE_MESSAGE_ID_PREFIX}${Date.now()}`;
  }

  return `${COMMITTED_PROACTIVE_MESSAGE_ID_PREFIX}${messageId}`;
}

function isCommittedProactiveMessage(message: UIMessage): boolean {
  return message.id.includes(COMMITTED_PROACTIVE_MESSAGE_ID_PREFIX);
}

function isNonMergeableProactiveMessage(message: UIMessage): boolean {
  return isTransientProactiveMessage(message) || isCommittedProactiveMessage(message);
}

function splitTextPartByTransientStage(
  part: { type: "text"; text: string }
): Array<{ parts: UIMessage["parts"]; stage: string | null }> {
  const match = part.text.match(
    /\[STAGE:\s*(new-session|interjection|contextual|reengagement|upsell)\s*\]/i
  );

  if (!match || match.index == null) {
    return [{ parts: [part], stage: null }];
  }

  const stage = match[1].toLowerCase();
  const before = part.text.slice(0, match.index).trim();
  const after = part.text.slice(match.index).trim();
  const segments: Array<{ parts: UIMessage["parts"]; stage: string | null }> = [];

  if (before) {
    segments.push({ parts: [{ type: "text", text: before }], stage: null });
  }
  if (after) {
    segments.push({ parts: [{ type: "text", text: after }], stage });
  }

  return segments.length > 0 ? segments : [{ parts: [part], stage: null }];
}

/** Keep proactive peek messages in chat history once the shopper engages. */
export function commitTransientProactiveMessages(messages: UIMessage[]): UIMessage[] {
  let changed = false;

  const next = messages.map((message) => {
    if (!isTransientProactiveMessage(message)) return message;

    changed = true;
    return {
      ...message,
      id: promoteCommittedAssistantId(message.id),
      parts: message.parts.map((part) =>
        part.type === "text"
          ? { ...part, text: stripStageTag(part.text).trim() }
          : part
      ),
    };
  });

  return changed ? next : messages;
}

function isTransientAssistantMessage(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.id === "welcome") return true;
  if (isNonMergeableProactiveMessage(message)) return true;
  return getTextParts(message).some(
    (part) => getTransientStageFromText(part.text) != null
  );
}

export function shouldMergeAssistantMessages(previous: UIMessage, message: UIMessage) {
  if (message.role !== "assistant" || previous.role !== "assistant") return false;
  if (isNonMergeableProactiveMessage(previous) || isNonMergeableProactiveMessage(message)) {
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
        const textSegments = splitTextPartByTransientStage(part);
        for (const segment of textSegments) {
          if (segment.stage) {
            if (currentParts.length > 0) {
              segments.push({ parts: currentParts, stage: null });
              currentParts = [];
            }
            segments.push(segment);
            continue;
          }

          currentParts.push(...segment.parts);
        }
        continue;
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
          : segment.stage
            ? `${COMMITTED_PROACTIVE_MESSAGE_ID_PREFIX}${message.id}-${index}`
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
