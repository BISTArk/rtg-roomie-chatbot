"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  generateId,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChatHeader } from "./ChatHeader";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { WidgetAvatar } from "./WidgetAvatar";
import {
  saveMessages,
  loadMessages,
  clearMessages,
  initFromBridge,
  configureMessageStorageNamespace,
} from "@/lib/chat-storage";
import { stripStageTag } from "@/lib/stage-tag";
import {
  type VisitorProfile,
  recordVisit,
  loadVisitorProfile,
  updateProfileFromChat,
  initProfileFromBridge,
  configureProfileStorageNamespace,
} from "@/lib/visitor-profile";
import type { PageContext, BrowsingHistoryEntry } from "@/lib/system-prompt";
import {
  SHOP_ASSIST_PAGE_CONTEXT_MESSAGE,
  isAllowedContextMessageSource,
  sanitizeHostPageContext,
} from "@/lib/page-context";
import { useProactiveGuard, type ProactiveReason } from "@/hooks/useProactiveGuard";
import { useChatState } from "@/hooks/useChatState";
import { isInComplaintMode } from "@/lib/complaint-detection";
import {
  buildWidgetThemeStyle,
  getWindowChatConfig,
  getWelcomeMessage,
  mergeWidgetConfigLayers,
  resolveWidgetConfig,
  type WidgetBranding,
} from "@/lib/widget-config";
import {
  getBrowserSessionId,
  getScopedStorageKey,
  setStorageNamespace,
} from "@/lib/browser-session";
import type { PersistedChatMessage } from "@/lib/chat-types";
import type { TenantBootstrap } from "@/lib/platform-types";

export type ChatMessage = PersistedChatMessage;

export type { PageContext };

const CHAT_ID = "shop-assist-chat";
const HANDOFF_PHRASES = [
  "talk to someone",
  "talk to a person",
  "talk to a human",
  "speak to someone",
  "speak to a person",
  "speak to a human",
  "speak to an agent",
  "talk to an agent",
  "human agent",
  "real person",
  "live agent",
  "customer service",
  "customer support",
  "representative",
];

function buildWelcomeUi(branding: WidgetBranding): UIMessage {
  return {
    id: "welcome",
    role: "assistant",
    parts: [{ type: "text", text: getWelcomeMessage(branding) }],
  };
}

function buildSystemNoticeUi(text: string): UIMessage {
  return {
    id: generateId(),
    role: "assistant",
    parts: [{ type: "text", text }],
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function getTextFromUIMessage(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function uiMessageToChatMessage(m: UIMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    text: stripStageTag(getTextFromUIMessage(m)),
  };
}

function chatMessageToUi(m: ChatMessage): UIMessage {
  return {
    id: m.id,
    role: m.role,
    parts: [{ type: "text", text: m.text }],
  };
}

// Read page context from host page (standalone mode only)
function getPageContext(): PageContext | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (window as any).SHOP_ASSIST_CONTEXT;
  if (!ctx) return null;
  return {
    page: ctx.page || "unknown",
    productName: ctx.productName,
    productVariantId: ctx.productVariantId,
    productSku: ctx.productSku,
    productPrice: ctx.productPrice,
    productVendor: ctx.productVendor,
    productType: ctx.productType,
    productDescription: ctx.productDescription,
    productImage: ctx.productImage,
    productUrl: ctx.productUrl,
    productTags: ctx.productTags,
    category: ctx.category,
    cartItems: ctx.cartItems,
    cartTotal: ctx.cartTotal,
    cartCount: ctx.cartCount,
    searchQuery: ctx.searchQuery,
    dwellSeconds: ctx.dwellSeconds,
    dwellThreshold: ctx.dwellThreshold,
    pageHistory: ctx.pageHistory,
    purchasedProducts: ctx.purchasedProducts,
    browsingHistory: ctx.browsingHistory,
  };
}

function getRuntimeTenantKey(): string {
  if (typeof window === "undefined") return "";
  const configTenantKey = getWindowChatConfig()?.tenantKey?.trim();
  if (configTenantKey) return configTenantKey;
  try {
    return new URLSearchParams(window.location.search).get("tenantKey")?.trim() || "";
  } catch {
    return "";
  }
}

function getHostOrigin(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.location.origin;
  } catch {
    return "";
  }
}

async function fetchTenantBootstrap(input: {
  tenantKey: string;
  sessionId: string;
  hostOrigin: string;
  localMessages?: PersistedChatMessage[] | null;
  localProfile?: VisitorProfile | null;
}): Promise<TenantBootstrap> {
  const response = await fetch("/api/widget/bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const text = await response.text();
    const parsed = (() => {
      try {
        return JSON.parse(text) as { error?: string };
      } catch {
        return null;
      }
    })();
    const message = parsed?.error?.trim() || text || "Failed to bootstrap tenant session.";
    throw new Error(message);
  }

  return (await response.json()) as TenantBootstrap;
}

export function ChatWidget({ embed = false }: { embed?: boolean } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string>("");
  const [visitorProfile, setVisitorProfile] = useState<VisitorProfile | null>(null);
  const selectedModel = "gemini-flash-3";
  const initialTenantKey = getRuntimeTenantKey();
  const [widgetConfig, setWidgetConfig] = useState(() =>
    resolveWidgetConfig(getWindowChatConfig())
  );
  const [tenantKey, setTenantKey] = useState(initialTenantKey);
  const [tenantToken, setTenantToken] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [storageNamespace, setStorageNamespaceState] = useState<string>(
    initialTenantKey || "shop-assist-unresolved"
  );
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [browsingHistory, setBrowsingHistory] = useState<BrowsingHistoryEntry[]>([]);
  const [humanMode, setHumanMode] = useState(false);
  const welcomeUi = useMemo(
    () => buildWelcomeUi(widgetConfig.branding),
    [widgetConfig.branding]
  );
  const widgetThemeStyle = useMemo(
    () => buildWidgetThemeStyle(widgetConfig.theme),
    [widgetConfig.theme]
  );
  const isLeftPlacement = widgetConfig.placement === "bottom-left";
  const launcherPositionClass = isLeftPlacement
    ? "left-2 sm:left-4"
    : "right-4 sm:right-6";
  const panelPositionClass = isLeftPlacement
    ? "left-0 right-auto sm:left-4 sm:right-auto"
    : "right-0 left-auto sm:right-6 sm:left-auto";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleSendRef = useRef<(text: string) => void>(undefined);
  const visitorProfileRef = useRef(visitorProfile);
  const selectedModelRef = useRef(selectedModel);
  const pageContextRef = useRef(pageContext);
  const browsingHistoryRef = useRef(browsingHistory);
  const brandingRef = useRef(widgetConfig.branding);
  const tenantKeyRef = useRef(tenantKey);
  const tenantTokenRef = useRef(tenantToken);
  const sessionIdRef = useRef(sessionId);
  const hostOriginRef = useRef(getHostOrigin());
  const requestExtrasRef = useRef<Record<string, unknown> | null>(null);
  const isOpenRef = useRef(isOpen);
  // Durable flag: set when user clicks the in-chat refresh icon. Blocks
  // "Welcome back, you were looking for..." greetings in both the same
  // session (handleOpen → generateReturningGreeting) and future sessions
  // (shop-assist-init → triggerNewSessionGreeting returning path). Cleared when
  // the user sends their first message after the refresh. Storage is
  // bridged to embed.js → host localStorage so it persists across tabs
  // and reloads.
  const suppressReturningRef = useRef<boolean>(false);

  // State 2 (BROWSING_CHAT_OPEN): contextual product commentary tracking
  const lastContextualProductRef = useRef<string>("");
  const lastContextualAtRef = useRef<number>(0);
  const contextualDwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State 1 (IDLE): track last activity; detect 20min idleness
  const lastActivityAtRef = useRef<number>(Date.now());
  const isIdleRef = useRef<boolean>(false);
  const reengagementFiredRef = useRef<boolean>(false);

  // Trigger refs — set later once useCallbacks are defined
  const triggerContextualRef = useRef<() => void>(undefined);
  const triggerReengagementRef = useRef<() => void>(undefined);
  const triggerInterjectionRef = useRef<(type: string) => void>(undefined);
  const triggerNewSessionGreetingRef = useRef<() => void>(undefined);
  const triggerUpsellRef = useRef<() => void>(undefined);
  // Pending upsell: set when add-to-cart succeeds, cleared when we fire
  // the upsell (either on next cart refresh or via fallback timeout).
  const pendingUpsellRef = useRef<{ at: number; fallback?: ReturnType<typeof setTimeout> } | null>(null);
  const scheduleContextualForPdpRef = useRef<(ctx: PageContext) => void>(undefined);

  const IDLE_THRESHOLD_MS = 20 * 60 * 1000;      // 20 minutes
  const CONTEXTUAL_COOLDOWN_MS = 30 * 1000;       // 30 seconds between messages
  const CONTEXTUAL_DWELL_MS = 5 * 1000;            // must stay 5s on PDP

  useEffect(() => {
    isOpenRef.current = isOpen;
    // Tell embed.js to resize the iframe
    if (embed && typeof window !== "undefined" && window.parent !== window) {
      window.parent.postMessage(
        { type: isOpen ? "shop-assist-widget-open" : "shop-assist-widget-close" },
        "*"
      );
    }
  }, [isOpen, embed]);
  useEffect(() => { visitorProfileRef.current = visitorProfile; }, [visitorProfile]);
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
  useEffect(() => { pageContextRef.current = pageContext; }, [pageContext]);
  useEffect(() => { browsingHistoryRef.current = browsingHistory; }, [browsingHistory]);
  useEffect(() => { brandingRef.current = widgetConfig.branding; }, [widgetConfig.branding]);
  useEffect(() => { tenantKeyRef.current = tenantKey; }, [tenantKey]);
  useEffect(() => { tenantTokenRef.current = tenantToken; }, [tenantToken]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => {
    setStorageNamespace(storageNamespace);
    configureMessageStorageNamespace(storageNamespace);
    configureProfileStorageNamespace(storageNamespace);
  }, [storageNamespace]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, body }) => {
          const extras = requestExtrasRef.current;
          requestExtrasRef.current = null;
          const ctx = pageContextRef.current || getPageContext();
          return {
            headers: {
              "x-tenant-token": tenantTokenRef.current,
            },
            body: {
              id,
              messages,
              ...(body ?? {}),
              tenantKey: tenantKeyRef.current,
              sessionId: sessionIdRef.current || id,
              hostOrigin: hostOriginRef.current,
              visitorProfile: visitorProfileRef.current ?? undefined,
              model: selectedModelRef.current,
              branding: brandingRef.current,
              ...(ctx ? { pageContext: ctx } : {}),
              browsingHistory: browsingHistoryRef.current.length > 0
                ? browsingHistoryRef.current : undefined,
              ...extras,
            },
          };
        },
      }),
    []
  );

  const { messages, sendMessage, setMessages, status, stop } = useChat({
    id: CHAT_ID,
    transport,
    messages: [welcomeUi],
  });

  const isStreaming = status === "streaming" || status === "submitted";

  const displayMessages: ChatMessage[] = messages.map(uiMessageToChatMessage);

  // ── Proactive guard: single gate for all spontaneous messages ──
  const proactive = useProactiveGuard({ isStreaming, humanMode });

  // Chat state tracking (observable for analytics; does not drive behavior)
  const [isNewSessionPhase, setIsNewSessionPhase] = useState(false);
  const lastUserMsgAtRef = useRef<number | null>(null);
  const userMessageCount = displayMessages.filter((m) => m.role === "user").length;
  const msSinceLastUserMessage = lastUserMsgAtRef.current != null
    ? Date.now() - lastUserMsgAtRef.current
    : null;
  const chatState = useChatState({
    isOpen,
    humanMode,
    isNewSessionPhase,
    isIdle: false, // updated by the idle interval below (via ref → re-render)
    msSinceLastUserMessage,
  });
  // Available for future analytics hooks
  void chatState;
  void userMessageCount;

  // ── Message listener: handles bridge init, context updates, URL clicks, prompts ──
  useEffect(() => {
    async function handleMessage(e: MessageEvent) {
      // shop-assist-init: full initialization from embed.js
      if (e.data?.type === "shop-assist-init") {
        const data = e.data;
        const incomingTenantKey =
          String(data.tenantKey || getRuntimeTenantKey()).trim();
        const incomingNamespace =
          String(data.storageNamespace || incomingTenantKey || "shop-assist-unresolved").trim() || "shop-assist-unresolved";
        setStorageNamespace(incomingNamespace);
        configureMessageStorageNamespace(incomingNamespace);
        configureProfileStorageNamespace(incomingNamespace);
        const incomingSessionId =
          String(data.sessionId || "").trim() || getBrowserSessionId();

        setTenantKey(incomingTenantKey);
        setSessionId(incomingSessionId);
        setStorageNamespaceState(incomingNamespace);
        hostOriginRef.current = String(data.hostOrigin || getHostOrigin()).trim() || getHostOrigin();
        if (data.pageContext) setPageContext(data.pageContext);
        if (data.browsingHistory) setBrowsingHistory(data.browsingHistory);

        try {
          const bootstrap = await fetchTenantBootstrap({
            tenantKey: incomingTenantKey,
            sessionId: incomingSessionId,
            hostOrigin: hostOriginRef.current,
            localMessages: data.chatMessages || null,
            localProfile: data.visitorProfile || null,
          });

          setBootstrapError("");
          setTenantToken(bootstrap.tenantToken);
          setStorageNamespaceState(bootstrap.tenant.storageNamespace);
          const nextConfig = mergeWidgetConfigLayers(
            {
              theme: bootstrap.tenant.theme,
              branding: bootstrap.tenant.branding,
            },
            {
              theme: data.theme,
              branding: data.branding,
            }
          );
          setWidgetConfig(nextConfig);

          initFromBridge(bootstrap.session.messages || data.chatMessages || null, true);
          initProfileFromBridge(bootstrap.session.visitorProfile || data.visitorProfile || null, true);
          suppressReturningRef.current = data.suppressReturning === true;

          const saved = loadMessages();
          if (saved && saved.length > 0) {
            setMessages(saved.map(chatMessageToUi));
          } else {
            setMessages([buildWelcomeUi(nextConfig.branding)]);
          }

          const profile = recordVisit({
            productName: data.pageContext?.productName,
            category: data.pageContext?.category,
            purchasedProducts: data.pageContext?.purchasedProducts,
          });
          setVisitorProfile(profile);
        } catch (error) {
          console.error("[widget] bootstrap failed:", error);
          const message = getErrorMessage(
            error,
            "The shopping assistant could not connect right now. Please try again shortly."
          );
          setBootstrapError(message);
          setTenantToken("");
          const nextConfig = resolveWidgetConfig({
            theme: data.theme,
            branding: data.branding,
          });
          setWidgetConfig(nextConfig);
          initFromBridge(data.chatMessages || null, true);
          initProfileFromBridge(data.visitorProfile || null, true);
          const saved = loadMessages();
          const restored = saved && saved.length > 0 ? saved.map(chatMessageToUi) : [buildWelcomeUi(nextConfig.branding)];
          setMessages([
            ...restored,
            buildSystemNoticeUi(message),
          ]);
          setVisitorProfile(recordVisit({
            productName: data.pageContext?.productName,
            category: data.pageContext?.category,
            purchasedProducts: data.pageContext?.purchasedProducts,
          }));
        }

        // Handle pending product summary (Behavior A — user clicked a
        // product card inside the chat). Record the product name so State 2
        // won't also fire a contextual message for the same product.
        if (data.pendingProduct && data.pendingProduct.productName) {
          lastContextualProductRef.current = data.pendingProduct.productName;
          lastContextualAtRef.current = Date.now();
          setIsOpen(true);
          setTimeout(() => {
            // Natural phrasing — how an actual customer would ask about the
            // product they just clicked. The AI already has the conversation
            // history and knows to include Add-to-Cart / Compare tiles for
            // product responses (per recommendation skill), so we don't need
            // robotic instructions in the user message.
            handleSendRef.current?.(
              `Tell me more about the ${data.pendingProduct.productName}`
            );
          }, 800);
        }

        // Auto-open the widget when a shared chat link is loaded
        if (data.isSharedChat) {
          setIsOpen(true);
        }

        // Restore previous open/closed state across page navigations
        if (data.widgetOpen) {
          setIsOpen(true);
        }

        // State 4: Fresh session (all tabs were closed). ALWAYS fire — whether
        // there's prior chat history or not. triggerNewSessionGreeting picks
        // the right path internally (returning vs new-session) and appends
        // without wiping existing history.
        if (data.isNewSession && !data.pendingProduct && !data.isSharedChat) {
          setTimeout(() => {
            triggerNewSessionGreetingRef.current?.();
          }, 2000);
        }

        // State 2 on full page load: Shopify themes typically do full page
        // loads for product clicks, so SHOP_ASSIST_PAGE_CONTEXT_MESSAGE won't fire
        // for the initial navigation. Schedule contextual here too.
        const initialCtx = data.pageContext as PageContext | undefined;
        const chatWillBeOpen = data.widgetOpen || data.isSharedChat;
        if (chatWillBeOpen && !data.pendingProduct && initialCtx) {
          // Small delay so refs are settled and setIsOpen has flushed
          setTimeout(() => scheduleContextualForPdpRef.current?.(initialCtx), 300);
        }

        setLoaded(true);
        return;
      }

      // Page context update (from embed.js on SPA navigation or async data)
      if (e.data?.type === SHOP_ASSIST_PAGE_CONTEXT_MESSAGE) {
        if (!isAllowedContextMessageSource(e.source)) return;
        const sanitized = sanitizeHostPageContext(e.data.context);
        if (!sanitized) return;

        // In embed mode, update React state directly
        setPageContext((prev) => prev ? { ...prev, ...sanitized } : sanitized);

        // Also update window context for standalone compatibility
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).SHOP_ASSIST_CONTEXT = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(window as any).SHOP_ASSIST_CONTEXT,
          ...sanitized,
        };
        const ctx = sanitized;
        if (ctx.productName || ctx.category) {
          const updated = recordVisit({
            productName: ctx.productName,
            category: ctx.category,
            purchasedProducts: ctx.purchasedProducts,
          });
          setVisitorProfile(updated);
        }

        // If a pending upsell is waiting and this update includes cart
        // data (the signal that embed.js fetched the refreshed cart after
        // the add-to-cart), fire the upsell now — with fresh cart context.
        if (
          pendingUpsellRef.current &&
          Array.isArray(ctx.cartItems) &&
          ctx.cartItems.length > 0
        ) {
          const pending = pendingUpsellRef.current;
          if (pending.fallback) clearTimeout(pending.fallback);
          pendingUpsellRef.current = null;
          // Small settle delay so the pageContext state commit has flushed
          setTimeout(() => triggerUpsellRef.current?.(), 200);
        }

        // State 2: BROWSING_CHAT_OPEN — contextual product commentary
        scheduleContextualForPdpRef.current?.(ctx);
        return;
      }

      // State 3 interjection from embed.js scheduler (chat closed + time
      // threshold hit). Auto-open the chat and fire the matching API call.
      if (e.data?.type === "shop-assist-interjection" && typeof e.data.interjectionType === "string") {
        const type = e.data.interjectionType as string;
        setIsOpen(true);
        setTimeout(() => {
          triggerInterjectionRef.current?.(type);
        }, 250);
        return;
      }

      // Activity pulse from embed.js (throttled to 1 per 5s on host side).
      // Used for State 1 IDLE detection and re-engagement trigger.
      if (e.data?.type === "shop-assist-activity") {
        const now = Date.now();
        const wasIdle = isIdleRef.current;
        isIdleRef.current = false;
        lastActivityAtRef.current = now;

        // If we were idle and re-engagement hasn't fired yet this cycle,
        // fire it now. Requires prior conversation + chat must be open.
        if (wasIdle && !reengagementFiredRef.current && isOpenRef.current) {
          reengagementFiredRef.current = true;
          triggerReengagementRef.current?.();
        }
        return;
      }

      // Shopify cart / checkout from InlineHTML iframe (relay to host embed.js)
      if (e.data?.type === "shop-assist-add-to-cart") {
        if (!embed || typeof window === "undefined" || window.parent === window) {
          return;
        }
        window.parent.postMessage(
          {
            type: "shop-assist-add-to-cart",
            variantId: e.data.variantId,
            quantity: e.data.quantity,
          },
          "*"
        );
        return;
      }

      // Cart action result coming BACK from embed.js after it hit
      // Shopify's /cart/add.js. Surface a short acknowledgment in the
      // chat so the customer knows the cart action happened.
      if (e.data?.type === "shop-assist-cart-action-result") {
        const ok = !!e.data.ok;
        const productName = pageContextRef.current?.productName;
        const successText = productName
          ? `✅ Added **${productName}** to your cart!`
          : "✅ Added to your cart!";
        const errorText = e.data.error
          ? `Hmm — couldn't add that to your cart. (${String(e.data.error).slice(0, 80)}) Try the Add to Cart button on the product page.`
          : "Hmm — couldn't add that to your cart. Try the Add to Cart button on the product page.";
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant",
            parts: [{ type: "text", text: ok ? successText : errorText }],
          },
        ]);
        // On success, schedule a cross-sell/upsell — but wait for the
        // cart refresh from embed.js before firing, so the AI sees the
        // item we just added when deciding what to suggest next. The
        // next shop-assist-page-context-update (which embed.js sends after
        // fetchCart completes) will trigger the upsell. 3s fallback
        // in case the context update is slow or fails.
        if (ok) {
          if (pendingUpsellRef.current?.fallback) {
            clearTimeout(pendingUpsellRef.current.fallback);
          }
          const fallback = setTimeout(() => {
            if (pendingUpsellRef.current) {
              pendingUpsellRef.current = null;
              triggerUpsellRef.current?.();
            }
          }, 3000);
          pendingUpsellRef.current = { at: Date.now(), fallback };
        }
        return;
      }
      if (e.data?.type === "shop-assist-checkout") {
        if (!embed || typeof window === "undefined" || window.parent === window) {
          return;
        }
        window.parent.postMessage({ type: "shop-assist-checkout" }, "*");
        return;
      }

      // Product link click from InlineHTML iframe
      if (e.data?.type === "shop-assist-open-url" && typeof e.data.url === "string") {
        const raw = e.data.url.trim();
        try {
          const parsed = new URL(raw);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            const productName = e.data.productName
              || parsed.pathname.split("/").pop()?.replace(/-/g, " ")
              || "";

            if (embed) {
              // Send to embed.js: save pending product + navigate host page
              window.parent.postMessage({
                type: "shop-assist-navigate",
                url: parsed.href,
                pendingProduct: productName ? { productName, url: parsed.href } : undefined,
              }, "*");
            } else {
              // Standalone: navigate directly
              window.location.href = parsed.href;
            }
          }
        } catch { /* ignore invalid URLs */ }
        return;
      }

      // Quick-reply prompt from InlineHTML iframe
      if (e.data?.type === "shop-assist-send-prompt" && e.data.text) {
        if (
          e.data.text === "__dismiss__" ||
          e.data.text.toLowerCase().includes("just browsing") ||
          e.data.text.toLowerCase().includes("not today") ||
          e.data.text.toLowerCase().includes("no thanks") ||
          e.data.text.toLowerCase().includes("just looking")
        ) {
          setIsOpen(false);
          return;
        }
        handleSendRef.current?.(e.data.text);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [embed, setMessages]);

  // ── Standalone init (non-embed mode) ──
  useEffect(() => {
    if (embed) return; // embed mode waits for shop-assist-init message

    let cancelled = false;
    async function initStandalone() {
      const windowConfig = getWindowChatConfig();
      const standaloneTenantKey = getRuntimeTenantKey();
      if (!standaloneTenantKey) {
        const message = "Missing tenant key. Open this embed with a valid tenantKey, or load it through the storefront embed script.";
        setBootstrapError(message);
        setTenantToken("");
        setWidgetConfig(resolveWidgetConfig(windowConfig));
        initFromBridge(null, false);
        initProfileFromBridge(null, false);
        setMessages([buildSystemNoticeUi(message)]);
        setLoaded(true);
        return;
      }
      setStorageNamespace(standaloneTenantKey);
      configureMessageStorageNamespace(standaloneTenantKey);
      configureProfileStorageNamespace(standaloneTenantKey);
      setTenantKey(standaloneTenantKey);
      setStorageNamespaceState(standaloneTenantKey);
      const standaloneSessionId = getBrowserSessionId();
      setSessionId(standaloneSessionId);
      hostOriginRef.current = getHostOrigin();

      // Load the refresh-suppression flag from localStorage (same key the
      // embed bridge uses on the host page, so the two modes stay aligned).
      try {
        suppressReturningRef.current =
          localStorage.getItem(getScopedStorageKey("suppress_returning")) === "1";
      } catch { /* noop */ }

      const localMessages = loadMessages();
      const localProfile = loadVisitorProfile();

      try {
        const bootstrap = await fetchTenantBootstrap({
          tenantKey: standaloneTenantKey,
          sessionId: standaloneSessionId,
          hostOrigin: hostOriginRef.current,
          localMessages,
          localProfile,
        });

        if (cancelled) return;
        setBootstrapError("");
        setTenantToken(bootstrap.tenantToken);
        setStorageNamespaceState(bootstrap.tenant.storageNamespace);
        const nextConfig = mergeWidgetConfigLayers(
          {
            theme: bootstrap.tenant.theme,
            branding: bootstrap.tenant.branding,
          },
          windowConfig
        );
        setWidgetConfig(nextConfig);
        initFromBridge(bootstrap.session.messages || null, false);
        initProfileFromBridge(bootstrap.session.visitorProfile || null, false);

        const saved = loadMessages();
        setMessages(saved && saved.length > 0 ? saved.map(chatMessageToUi) : [buildWelcomeUi(nextConfig.branding)]);

        const ctx = getPageContext();
        if (ctx) setPageContext(ctx);

        const profile = recordVisit({
          productName: ctx?.productName,
          category: ctx?.category,
          purchasedProducts: ctx?.purchasedProducts,
        });
        setVisitorProfile(profile);
      } catch (error) {
        console.error("[widget] standalone bootstrap failed:", error);
        const message = getErrorMessage(
          error,
          "The shopping assistant could not connect right now. Please try again shortly."
        );
        setBootstrapError(message);
        setTenantToken("");
        const nextConfig = resolveWidgetConfig(windowConfig);
        setWidgetConfig(nextConfig);
        initFromBridge(null, false);
        initProfileFromBridge(null, false);
        const saved = loadMessages();
        const restored = saved && saved.length > 0 ? saved.map(chatMessageToUi) : [buildWelcomeUi(nextConfig.branding)];
        setMessages([
          ...restored,
          buildSystemNoticeUi(message),
        ]);
        const ctx = getPageContext();
        if (ctx) setPageContext(ctx);
        setVisitorProfile(recordVisit({
          productName: ctx?.productName,
          category: ctx?.category,
          purchasedProducts: ctx?.purchasedProducts,
        }));
      }

      if (!cancelled) setLoaded(true);
    }

    void initStandalone();
    return () => {
      cancelled = true;
    };
  }, [embed, setMessages]);

  // Save messages whenever they change (to bridge or localStorage)
  useEffect(() => {
    if (loaded) {
      saveMessages(displayMessages);
    }
  }, [displayMessages, loaded]);

  // Update visitor profile with preferences when messages change
  useEffect(() => {
    if (loaded && displayMessages.length > 1) {
      updateProfileFromChat(
        displayMessages.map((m) => ({ role: m.role, text: m.text })),
        ""
      );
    }
  }, [displayMessages, loaded]);

  useEffect(() => {
    if (!loaded || !tenantToken || !tenantKey || !sessionId) return;
    const timeout = setTimeout(() => {
      void fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-token": tenantToken,
        },
        body: JSON.stringify({
          tenantKey,
          sessionId,
          hostOrigin: hostOriginRef.current,
          lastPageUrl: typeof window !== "undefined" ? window.location.href : undefined,
          messages: displayMessages,
          visitorProfile: visitorProfileRef.current,
        }),
      }).catch((error) => {
        console.error("[widget] session sync failed:", error);
      });
    }, 300);

    return () => clearTimeout(timeout);
  }, [displayMessages, loaded, sessionId, tenantKey, tenantToken, visitorProfile]);

  // Scroll to bottom when widget opens or chat is restored.
  // Product card iframes resize asynchronously (images load, content expands),
  // so a single scrollTop assignment lands "in the middle". We use a
  // ResizeObserver to keep snapping to the bottom while the container grows,
  // for a short window after the widget opens.
  useEffect(() => {
    if (!isOpen) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    function toBottom() {
      if (container) container.scrollTop = container.scrollHeight;
    }

    // Initial scrolls at staggered times to catch late-loading iframes
    requestAnimationFrame(toBottom);
    const timers = [
      setTimeout(toBottom, 100),
      setTimeout(toBottom, 300),
      setTimeout(toBottom, 800),
    ];

    // Watch for content size changes during the first ~1.5s
    let pinToBottom = true;
    const observer = new ResizeObserver(() => {
      if (pinToBottom) toBottom();
    });
    observer.observe(container);
    const stopPin = setTimeout(() => { pinToBottom = false; }, 1500);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(stopPin);
      observer.disconnect();
    };
  }, [isOpen, loaded]);

  // Scroll so the top of the new AI response sits at 20% from top (leaving 80% for reading)
  const lastAssistantMessageId = messages.findLast((m) => m.role === "assistant")?.id;
  const prevAssistantIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!lastAssistantMessageId || lastAssistantMessageId === prevAssistantIdRef.current) return;
    // A brand-new assistant message appeared (the ID check above prevents
    // re-firing on subsequent streaming chunks of the same message). Scroll
    // to it regardless of whether it came from useChat.sendMessage, a
    // proactive transport.sendMessages call, or a direct setMessages inject.
    prevAssistantIdRef.current = lastAssistantMessageId;

    requestAnimationFrame(() => {
      const el = lastAssistantRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [lastAssistantMessageId]);

  const consumeAssistantStream = useCallback(async (stream: ReadableStream<UIMessageChunk>) => {
    const assistantId = generateId();
    try {
      for await (const uiMessage of readUIMessageStream({ stream })) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== assistantId),
          { ...uiMessage, id: assistantId },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== assistantId),
        {
          id: assistantId,
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "Sorry, I ran into an issue connecting. Please try again.",
            },
          ],
        },
      ]);
    }
  }, [setMessages]);

  // Generate personalized greeting for returning visitors when widget opens
  const generateReturningGreeting = useCallback(async () => {
    const profile = loadVisitorProfile();
    if (profile.visitCount <= 1 && profile.viewedProducts.length === 0) {
      return;
    }

    const saved = loadMessages();
    if (saved && saved.length > 1) {
      return;
    }

    setMessages([]);

    try {
      requestExtrasRef.current = {
        type: "returning",
        visitorProfile: profile,
      };
      const chunkStream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: CHAT_ID,
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });
      await consumeAssistantStream(chunkStream);
    } catch {
      setMessages([welcomeUi]);
    }
  }, [transport, setMessages, welcomeUi, consumeAssistantStream]);

  // Shared guard gate — every proactive trigger calls this first.
  // `mark` (default true) advances the 15s stack debounce. State 4's
  // new-session greeting is a one-shot init message, not an interruption —
  // it should NOT block State 2's 5s-dwell contextual from firing right
  // after on a PDP landing. Pass `mark: false` to skip the mark.
  //
  // Complaint suppression: if the customer is mid-complaint/return, do NOT
  // fire any proactive trigger. Upsells, interjections, contextual notes,
  // and re-engagement are all silenced until the AI transitions out of
  // the complaint stage.
  const gatedFire = useCallback(
    (
      which: ProactiveReason,
      mark = true,
      options: { bypassDebounce?: boolean } = {}
    ): boolean => {
      const plainMessages = messages.map((m) => ({
        role: m.role,
        text: m.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(""),
      }));
      if (isInComplaintMode(plainMessages)) {
        console.log(`[proactive] ${which} skipped: complaint-mode`);
        return false;
      }
      const result = proactive.canFire(which, pageContextRef.current, options);
      if (!result.allowed) {
        console.log(`[proactive] ${which} skipped: ${result.reason}`);
        return false;
      }
      if (mark) proactive.markFired();
      return true;
    },
    [proactive, messages]
  );

  // Reusable: schedule a State 2 contextual commentary after the dwell gate.
  // Called from the shop-assist-init handler (full page load), the page-context-update
  // handler (SPA nav), and handleOpen (user opens chat while on a PDP).
  const scheduleContextualForPdp = useCallback((ctx: PageContext) => {
    if (ctx.page !== "pdp" || !ctx.productName) return;
    if (ctx.productName === lastContextualProductRef.current) return;
    if (contextualDwellTimerRef.current) {
      clearTimeout(contextualDwellTimerRef.current);
      contextualDwellTimerRef.current = null;
    }
    const productAtNavigation = ctx.productName;
    contextualDwellTimerRef.current = setTimeout(() => {
      contextualDwellTimerRef.current = null;
      if (!isOpenRef.current) return;
      const currentCtx = pageContextRef.current;
      if (!currentCtx || currentCtx.productName !== productAtNavigation) return;
      if (Date.now() - lastContextualAtRef.current < CONTEXTUAL_COOLDOWN_MS) return;
      lastContextualProductRef.current = productAtNavigation;
      lastContextualAtRef.current = Date.now();
      triggerContextualRef.current?.();
    }, CONTEXTUAL_DWELL_MS);
  }, [CONTEXTUAL_COOLDOWN_MS, CONTEXTUAL_DWELL_MS]);

  // State 2: Fire contextual product commentary. Routed through the guard.
  // Event-driven (user just landed on a PDP), so it bypasses the 15s
  // stack-debounce. Its own CONTEXTUAL_COOLDOWN_MS (30s, enforced in
  // scheduleContextualForPdp) is the right guard against repetition.
  const triggerContextual = useCallback(async () => {
    if (!gatedFire("contextual", true, { bypassDebounce: true })) return;
    try {
      requestExtrasRef.current = {
        type: "contextual",
        pageContext: pageContextRef.current,
      };
      const chunkStream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: CHAT_ID,
        messageId: undefined,
        messages: messages,
        abortSignal: new AbortController().signal,
      });
      await consumeAssistantStream(chunkStream);
    } catch (err) {
      console.log("[proactive] contextual API call failed:", err);
    }
  }, [transport, messages, gatedFire, consumeAssistantStream]);

  // State 1: Fire re-engagement after 20min idle. Requires prior conversation.
  const triggerReengagement = useCallback(async () => {
    // Require some prior conversation for re-engagement to have context
    const userMsgs = messages.filter((m) => m.role === "user");
    if (userMsgs.length === 0) return;
    if (!gatedFire("reengagement")) return;
    try {
      requestExtrasRef.current = {
        type: "reengagement",
        visitorProfile: visitorProfileRef.current ?? undefined,
      };
      const chunkStream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: CHAT_ID,
        messageId: undefined,
        messages: messages,
        abortSignal: new AbortController().signal,
      });
      await consumeAssistantStream(chunkStream);
    } catch {
      /* swallow */
    }
  }, [transport, messages, gatedFire, consumeAssistantStream]);

  // State 3: Fire an interjection. Subtype selects the sub-template.
  const triggerInterjection = useCallback(async (interjectionType: string) => {
    if (!gatedFire("interjection")) return;
    try {
      requestExtrasRef.current = {
        type: "interjection",
        interjectionType,
        visitorProfile: visitorProfileRef.current ?? undefined,
        pageContext: pageContextRef.current,
      };
      const chunkStream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: CHAT_ID,
        messageId: undefined,
        messages: messages,
        abortSignal: new AbortController().signal,
      });
      await consumeAssistantStream(chunkStream);
    } catch {
      /* swallow */
    }
  }, [transport, messages, gatedFire, consumeAssistantStream]);

  // State 4: Greet on fresh session. For returning customers with prior chat
  // history, the greeting is APPENDED (history stays). For new customers with
  // no prior chat, messages start from a clean slate. Populates silently —
  // the widget's open/closed state is preserved from the last session.
  // Post-Add-to-Cart upsell — no lifetime cap. Every successful add triggers
  // a cross-sell OR wrap-up response so the conversation never hangs after
  // "Added to cart". The upsell skill handles fatigue via category-tracking
  // (never repeat a category, never suggest what's already in the cart).
  const triggerUpsell = useCallback(async () => {
    if (humanMode) return;
    // Event-driven: fires right after the user's Add-to-Cart commitment.
    // Bypass the 15s stack-debounce (a contextual commentary fired moments
    // earlier would otherwise swallow this), but keep cart/checkout,
    // streaming, and complaint guards.
    if (!gatedFire("upsell", false, { bypassDebounce: true })) return;
    try {
      requestExtrasRef.current = {
        type: "upsell",
        pageContext: pageContextRef.current,
      };
      const chunkStream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: CHAT_ID,
        messageId: undefined,
        messages: messages,
        abortSignal: new AbortController().signal,
      });
      await consumeAssistantStream(chunkStream);
    } catch (err) {
      console.log("[proactive] upsell API call failed:", err);
    }
  }, [transport, messages, humanMode, gatedFire, consumeAssistantStream]);

  const triggerNewSessionGreeting = useCallback(async () => {
    // State 4 is a one-shot init greeting; don't mark the 15s debounce so
    // State 2's contextual can still fire on PDP landings.
    if (!gatedFire("new-session", false)) return;
    const profile = loadVisitorProfile();
    const hasPriorChat = messages.filter((m) => m.id !== "welcome").length > 0;
    // Post-refresh: the customer explicitly asked for a clean slate. Force
    // the first-timer "new-session" path (generic intro) instead of
    // "returning" (welcome-back with history), even though visitCount > 1.
    const hasPriorContext =
      !suppressReturningRef.current &&
      (hasPriorChat ||
        profile.visitCount > 1 ||
        profile.viewedProducts.length > 0);
    setIsNewSessionPhase(true);
    // Auto-open the chat so the greeting is actually visible. Otherwise
    // the stream lands silently inside a closed pill and the visitor
    // never sees it.
    setIsOpen(true);
    try {
      if (!hasPriorChat) {
        // New customer: start fresh with no welcome (skill produces the intro)
        setMessages([]);
      }
      requestExtrasRef.current = hasPriorContext
        ? { type: "returning", visitorProfile: profile }
        : { type: "new-session", visitorProfile: profile };
      // When there's prior chat, send the full history to the API so the
      // returning skill can reference the last topic. When no history, send
      // empty array and the skill uses the generic new-session intro.
      const historyForApi = hasPriorChat ? messages : [];
      const chunkStream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: CHAT_ID,
        messageId: undefined,
        messages: historyForApi,
        abortSignal: new AbortController().signal,
      });
      await consumeAssistantStream(chunkStream);
    } catch {
      if (!hasPriorChat) setMessages([welcomeUi]);
    }
  }, [transport, messages, setMessages, gatedFire, welcomeUi, consumeAssistantStream]);

  // Wire up the refs so the message handler (stable across renders) can
  // call the latest version of these callbacks.
  useEffect(() => { triggerContextualRef.current = triggerContextual; }, [triggerContextual]);
  useEffect(() => { triggerReengagementRef.current = triggerReengagement; }, [triggerReengagement]);
  useEffect(() => { triggerInterjectionRef.current = triggerInterjection; }, [triggerInterjection]);
  useEffect(() => { triggerNewSessionGreetingRef.current = triggerNewSessionGreeting; }, [triggerNewSessionGreeting]);
  useEffect(() => { triggerUpsellRef.current = triggerUpsell; }, [triggerUpsell]);
  useEffect(() => { scheduleContextualForPdpRef.current = scheduleContextualForPdp; }, [scheduleContextualForPdp]);

  // Periodic check: if 20 minutes pass with no activity pulse, mark IDLE.
  // The actual re-engagement fires on the NEXT activity pulse (in the
  // message handler), not while the user is still idle.
  useEffect(() => {
    const interval = setInterval(() => {
      const gap = Date.now() - lastActivityAtRef.current;
      if (gap >= IDLE_THRESHOLD_MS) {
        if (!isIdleRef.current) {
          isIdleRef.current = true;
          // Reset the "fired" flag so the NEXT idle cycle can re-engage again
          reengagementFiredRef.current = false;
        }
      }
    }, 30_000); // check every 30s
    return () => clearInterval(interval);
  }, [IDLE_THRESHOLD_MS]);

  // Iframe-local activity tracking. embed.js pulses activity from the host
  // page, but interactions INSIDE the chat (scrolling history, typing in
  // the input, clicking tiles) also count as user activity and should
  // prevent the 20-minute idle timer from tripping.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let lastBump = 0;
    function bump() {
      const now = Date.now();
      if (now - lastBump < 2000) return; // throttle to 1 bump per 2s
      lastBump = now;
      const wasIdle = isIdleRef.current;
      isIdleRef.current = false;
      lastActivityAtRef.current = now;
      // Mirror the shop-assist-activity handler's re-engagement trigger so
      // iframe-originated activity can also wake up a State 1 fire.
      if (wasIdle && !reengagementFiredRef.current && isOpenRef.current) {
        reengagementFiredRef.current = true;
        triggerReengagementRef.current?.();
      }
    }
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((evt) => document.addEventListener(evt, bump, { passive: true }));
    return () => {
      events.forEach((evt) => document.removeEventListener(evt, bump));
    };
  }, []);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    if (
      visitorProfile &&
      visitorProfile.visitCount > 1 &&
      messages.length <= 1 &&
      !suppressReturningRef.current
    ) {
      generateReturningGreeting();
    }
    // If user is on a PDP and opens the chat, fire State 2 after dwell
    const ctx = pageContextRef.current;
    if (ctx && ctx.page === "pdp" && ctx.productName) {
      setTimeout(() => scheduleContextualForPdpRef.current?.(ctx), 300);
    }
  }, [visitorProfile, messages.length, generateReturningGreeting]);

  const handleRefresh = useCallback(() => {
    clearMessages();
    setMessages([welcomeUi]);
    setHumanMode(false);
    // Customer asked for a clean slate — suppress the "Welcome back..."
    // greeting until they actually send a message. Persists across sessions
    // via embed bridge (host localStorage) or standalone localStorage.
    suppressReturningRef.current = true;
    if (embed && typeof window !== "undefined" && window.parent !== window) {
      window.parent.postMessage({ type: "shop-assist-set-suppress-returning" }, "*");
    } else {
      try { localStorage.setItem(getScopedStorageKey("suppress_returning"), "1"); }
      catch { /* noop */ }
    }
  }, [setMessages, embed, welcomeUi]);

  const handleShare = useCallback(async () => {
    const shareableMessages = displayMessages.filter((m) => m.id !== "welcome");
    if (shareableMessages.length === 0) return;

    try {
      let url = "";
      const createShortLink = await fetch("/api/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-token": tenantTokenRef.current,
        },
        body: JSON.stringify({
          tenantKey: tenantKeyRef.current,
          messages: shareableMessages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      if (createShortLink.ok) {
        const payload = (await createShortLink.json()) as { id?: string };
        if (payload.id && typeof window !== "undefined") {
          const shared = new URL(window.location.href);
          shared.searchParams.set("c", payload.id);
          url = shared.toString();
        }
      }

      if (!url) {
        const json = JSON.stringify(
          shareableMessages.map((m) => ({ role: m.role, text: m.text }))
        );
        const stream = new Blob([json]).stream().pipeThrough(
          new CompressionStream("gzip")
        );
        const buffer = await new Response(stream).arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const encoded = btoa(binary)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        const shared = new URL(window.location.href);
        shared.searchParams.set("chat", encoded);
        url = shared.toString();
      }

      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const el = document.createElement("textarea");
        el.value = url;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
    } catch {
      /* share failed silently */
    }
  }, [displayMessages]);

  const triggerHandoff = useCallback(async () => {
    // 1. Show transfer message
    const transferId = generateId();
    setMessages((prev) => [
      ...prev,
      {
        id: transferId,
        role: "assistant",
        parts: [{ type: "text", text: "Sure, connecting you to a human agent." }],
      },
    ]);

    // 2. Get summary from API
    let summary = "";
    try {
      requestExtrasRef.current = { type: "summarize" };
      const chunkStream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: CHAT_ID,
        messageId: undefined,
        messages: messages,
        abortSignal: new AbortController().signal,
      });
      for await (const uiMessage of readUIMessageStream({ stream: chunkStream })) {
        summary = uiMessage.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
      }
    } catch {
      // summary stays empty
    }

    // 3. Show Joan's greeting with summary
    const joanId = generateId();
    const joanText = summary
      ? `Hello, this is Joan! I can see you've been ${summary} How can I help you today?`
      : `Hello, this is Joan! How may I help you today?`;
    setMessages((prev) => [
      ...prev,
      {
        id: joanId,
        role: "assistant",
        parts: [{ type: "text", text: joanText }],
      },
    ]);

    // 4. Lock out AI
    setHumanMode(true);
  }, [messages, transport, setMessages]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming || humanMode || !tenantTokenRef.current) return;

      // User typing = CONVERSATION mode. Reset all proactive timers/counters.
      const now = Date.now();
      lastActivityAtRef.current = now;
      isIdleRef.current = false;
      reengagementFiredRef.current = false;
      lastUserMsgAtRef.current = now;
      proactive.markUserActivity();
      setIsNewSessionPhase(false); // user has engaged; no longer in NEW_SESSION

      // Clear the post-refresh suppression flag on first user message —
      // they're engaging again, so future sessions can resume personalization.
      if (suppressReturningRef.current) {
        suppressReturningRef.current = false;
        if (embed && typeof window !== "undefined" && window.parent !== window) {
          window.parent.postMessage({ type: "shop-assist-clear-suppress-returning" }, "*");
        } else {
          try { localStorage.removeItem(getScopedStorageKey("suppress_returning")); }
          catch { /* noop */ }
        }
      }

      // Check for handoff intent
      const lower = text.toLowerCase();
      if (HANDOFF_PHRASES.some((phrase) => lower.includes(phrase))) {
        // First append the user message so it shows in chat
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "user",
            parts: [{ type: "text", text: text.trim() }],
          },
        ]);
        await triggerHandoff();
        return;
      }

      await sendMessage({ text: text.trim() });
    },
    [sendMessage, isStreaming, humanMode, triggerHandoff, setMessages, embed, proactive]
  );

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  return (
    <div style={widgetThemeStyle}>
      {/* Toggle button — Shopping Assistant pill */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className={`fixed bottom-4 z-50 flex items-center gap-2.5 rounded-full px-4 py-3 shadow-lg transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 sm:bottom-6 ${launcherPositionClass} ${embed ? "pointer-events-auto" : ""}`}
          style={{
            backgroundColor: "var(--widget-surface)",
            color: "var(--widget-text)",
            border: "1px solid var(--widget-border)",
            boxShadow: "var(--widget-shadow)",
          }}
          aria-label={`Open ${widgetConfig.branding.launcherLabel}`}
        >
          <WidgetAvatar
            size={32}
            branding={widgetConfig.branding}
            theme={widgetConfig.theme}
          />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--widget-text)" }}
          >
            {widgetConfig.branding.launcherLabel}
          </span>
        </button>
      )}

      {isOpen && (
        <>
          <button
            type="button"
            aria-label={`Close ${widgetConfig.branding.launcherLabel}`}
            onClick={() => setIsOpen(false)}
            className={`fixed inset-0 z-40 ${embed ? "pointer-events-auto" : ""}`}
            style={{ backgroundColor: "transparent" }}
          />

          <div
            className={`widget-enter fixed bottom-0 z-50 flex h-[80dvh] max-h-[80dvh] w-[min(420px,100vw)] max-w-[100vw] flex-col overflow-hidden rounded-t-[28px] shadow-2xl sm:bottom-6 sm:h-[640px] sm:max-h-[640px] sm:w-[420px] sm:rounded-2xl ${panelPositionClass} ${embed ? "pointer-events-auto" : ""}`}
            style={{
              border: "1px solid var(--widget-border)",
              backgroundColor: "var(--widget-surface)",
              boxShadow: "var(--widget-shadow)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ChatHeader
              onMinimize={() => setIsOpen(false)}
              onRefresh={handleRefresh}
              onShare={handleShare}
              branding={widgetConfig.branding}
              theme={widgetConfig.theme}
            />

            <ChatMessages
              messages={displayMessages}
              isStreaming={isStreaming}
              messagesEndRef={messagesEndRef}
              lastAssistantRef={lastAssistantRef}
              scrollContainerRef={scrollContainerRef}
              branding={widgetConfig.branding}
              theme={widgetConfig.theme}
            />

            <ChatInput
              onSend={handleSend}
              disabled={isStreaming || humanMode || (loaded && !tenantToken)}
              isStreaming={isStreaming}
              humanMode={humanMode}
              onAbort={stop}
              onChipClick={handleSend}
              branding={widgetConfig.branding}
            />
          </div>
        </>
      )}
    </div>
  );
}
