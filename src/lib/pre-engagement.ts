import type { UIMessage } from "ai";
import { getScopedStorageKey } from "@/lib/browser-session";

/**
 * Max unsolicited proactive AI calls (greeting, interjection, contextual, etc.)
 * before the customer engages. Saves tokens when someone ignores the widget.
 */
export const PROACTIVE_ATTEMPT_LIMIT = 3;
export const PROACTIVE_ATTEMPT_COUNT_KEY = "proactive_attempt_count";

let attemptCountCache = 0;
let useEmbedBridge = false;
let bridgeInitialized = false;

function hasToolOutput(part: UIMessage["parts"][number]): boolean {
  return (part as { state?: string }).state === "output-available";
}

function postToParent(type: string, data: Record<string, unknown> = {}) {
  if (!useEmbedBridge || typeof window === "undefined") return;
  try {
    window.parent.postMessage({ type, ...data }, "*");
  } catch {
    // noop
  }
}

function readStandaloneCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(getScopedStorageKey(PROACTIVE_ATTEMPT_COUNT_KEY));
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeStandaloneCount(count: number) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      getScopedStorageKey(PROACTIVE_ATTEMPT_COUNT_KEY),
      String(Math.max(0, count))
    );
  } catch {
    // noop
  }
}

/** Seed the in-memory counter from embed init or standalone session storage. */
export function initProactiveAttemptCount(input: {
  embed: boolean;
  count?: number;
}) {
  useEmbedBridge = input.embed;
  attemptCountCache =
    typeof input.count === "number"
      ? Math.max(0, input.count)
      : input.embed
        ? 0
        : readStandaloneCount();
  bridgeInitialized = true;
}

export function getProactiveAttemptCount(): number {
  if (!bridgeInitialized && !useEmbedBridge) {
    attemptCountCache = readStandaloneCount();
    bridgeInitialized = true;
  }
  return attemptCountCache;
}

/** Increment after a proactive AI response is delivered. Never decrements. */
export function recordProactiveAttempt(): number {
  const next = getProactiveAttemptCount() + 1;
  attemptCountCache = next;
  if (useEmbedBridge) {
    postToParent("shop-assist-save-proactive-attempts", { count: next });
  } else {
    writeStandaloneCount(next);
  }
  return next;
}

export function resetProactiveAttemptCount() {
  attemptCountCache = 0;
  if (useEmbedBridge) {
    postToParent("shop-assist-save-proactive-attempts", { count: 0 });
  } else {
    writeStandaloneCount(0);
  }
}

/** Customer typed, tapped a chip, or answered a guided question. */
export function hasUserEngaged(messages: UIMessage[]): boolean {
  for (const message of messages) {
    if (message.role === "user") return true;
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "tool-ask_user_question" && hasToolOutput(part)) {
        return true;
      }
    }
  }
  return false;
}

/** Stop firing proactive API calls once the budget is spent. */
export function isProactiveBudgetExhausted(messages: UIMessage[]): boolean {
  if (hasUserEngaged(messages)) return false;
  return getProactiveAttemptCount() >= PROACTIVE_ATTEMPT_LIMIT;
}

/** @deprecated Use isProactiveBudgetExhausted */
export const isPreEngagementExhausted = isProactiveBudgetExhausted;
