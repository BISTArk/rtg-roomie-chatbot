/**
 * Chat message persistence via the embed.js bridge.
 *
 * In embed mode, the iframe NEVER touches localStorage directly — all reads
 * come from the in-memory cache (seeded by embed.js on init), and all writes
 * are mirrored to the host page via postMessage.
 *
 * In standalone mode (direct visit to /), localStorage is used normally.
 */
import type { PersistedChatMessage as ChatMessage } from "@/lib/chat-types";
import { getScopedStorageKey, setStorageNamespace } from "@/lib/browser-session";

const STORAGE_KEY = "chat_messages";

// ── In-memory cache (source of truth inside the iframe) ──
let messageCache: ChatMessage[] = [];
let embedded = false;
let initialized = false;

/** Called once by ChatWidget when shop-assist-init arrives from embed.js */
export function initFromBridge(messages: ChatMessage[] | null, isEmbed: boolean) {
  embedded = isEmbed;
  if (messages && messages.length > 0) {
    messageCache = messages;
  }
  initialized = true;
}

export function configureMessageStorageNamespace(namespace: string | null | undefined) {
  setStorageNamespace(namespace);
}

export function isInitialized(): boolean {
  return initialized;
}

// ── Post to host page (embed.js) ──
function postToParent(type: string, data: Record<string, unknown> = {}) {
  if (!embedded) return;
  try {
    window.parent.postMessage({ type, ...data }, "*");
  } catch { /* cross-origin or no parent */ }
}

// ── Public API ──

export function saveMessages(messages: ChatMessage[]) {
  const toSave = messages.slice(-100);
  messageCache = toSave;

  if (embedded) {
    postToParent("shop-assist-save-messages", { messages: toSave });
  } else {
    try { localStorage.setItem(getScopedStorageKey(STORAGE_KEY), JSON.stringify(toSave)); }
    catch { /* quota */ }
  }
}

export function loadMessages(): ChatMessage[] | null {
  // In embed mode, cache is the only source
  if (embedded) {
    return messageCache.length > 0 ? messageCache : null;
  }

  // Standalone: check cache first, then localStorage
  if (messageCache.length > 0) return messageCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getScopedStorageKey(STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      messageCache = parsed;
      return parsed;
    }
  } catch { /* corrupted */ }
  return null;
}

export function clearMessages() {
  messageCache = [];
  if (embedded) {
    postToParent("shop-assist-clear-messages");
  } else {
    try { localStorage.removeItem(getScopedStorageKey(STORAGE_KEY)); }
    catch { /* noop */ }
  }
}
