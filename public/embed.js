/**
 * Storefront Shopping Assistant embed script.
 *
 * Drop this single <script> tag on any Shopify (or other) page:
 *   <script src="https://your-app-host.example/embed.js" defer></script>
 *
 * It auto-detects the Shopify page context (product, collection, cart, search,
 * homepage), tracks browsing history, and manages chat persistence — all in the
 * host page's first-party storage so Safari ITP cannot block it.
 *
 * The chat widget itself loads inside a same-origin iframe at /embed.
 */
(function () {
  "use strict";

  // ─── Constants ────────────────────────────────────────────────────────
  var STORAGE = {
    SESSION:    "session_id",
    CHAT:       "chat_messages",
    HISTORY:    "browsing_history",
    PENDING:    "pending_product",
    PROFILE:    "visitor_profile",
    WIDGET_OPEN:"widget_open",
    // Set to "1" when the user explicitly clicks the in-chat refresh icon.
    // Suppresses "Welcome back, you were looking for X..." greetings until
    // the user sends their first message (then the iframe postMessages to
    // clear it). Persists across page navigations and sessions.
    SUPPRESS_RETURNING: "suppress_returning",
  };
  var MAX_HISTORY = 30;
  var MSG_CONTEXT = "shop-assist-page-context-update";
  var SESSION_STATE_PREFIX = "shop_assist_session";

  // ─── Helpers ──────────────────────────────────────────────────────────
  function uid() {
    return "shopassist_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch { /* quota */ }
  }
  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }
  function safeJSON(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function parseJSON(raw) {
    if (typeof raw !== "string" || !raw.trim()) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function mergeConfig(base, override) {
    var next = {
      tenantKey: (base && base.tenantKey) || "",
      shopDomain: (base && base.shopDomain) || "",
      placement: (base && base.placement) || "",
      theme: Object.assign({}, base && base.theme),
      branding: Object.assign({}, base && base.branding),
    };
    if (override && typeof override.tenantKey === "string" && override.tenantKey.trim()) {
      next.tenantKey = override.tenantKey.trim();
    }
    if (override && typeof override.shopDomain === "string" && override.shopDomain.trim()) {
      next.shopDomain = override.shopDomain.trim();
    }
    if (override && (override.placement === "bottom-left" || override.placement === "bottom-right")) {
      next.placement = override.placement;
    }
    if (override && override.theme && typeof override.theme === "object") {
      next.theme = Object.assign(next.theme, override.theme);
    }
    if (override && override.branding && typeof override.branding === "object") {
      next.branding = Object.assign(next.branding, override.branding);
    }
    return next;
  }
  function getEmbedScript() {
    if (document.currentScript && /\/embed\.js(?:\?|$)/.test(document.currentScript.src || "")) {
      return document.currentScript;
    }
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (/\/embed\.js(?:\?|$)/.test(scripts[i].src || "")) {
        return scripts[i];
      }
    }
    return null;
  }
  function readScriptConfig() {
    var script = getEmbedScript();
    if (!script) return null;
    var scriptUrl = "";
    try { scriptUrl = script.src ? new URL(script.src, window.location.href).toString() : ""; } catch { scriptUrl = script.src || ""; }
    var scriptSearch = "";
    try { scriptSearch = scriptUrl ? new URL(scriptUrl).search : ""; } catch { scriptSearch = ""; }
    var scriptParams = new URLSearchParams(scriptSearch || "");

    var tenantKey = script.dataset.tenantKey || "";
    var shopDomain = script.dataset.shop || scriptParams.get("shop") || "";
    var placement = script.dataset.placement || "";
    var theme = {};
    var branding = {};
    var themeJson = parseJSON(script.dataset.theme);
    var brandingJson = parseJSON(script.dataset.branding);
    if (themeJson && typeof themeJson === "object") {
      theme = Object.assign(theme, themeJson);
    }
    if (brandingJson && typeof brandingJson === "object") {
      branding = Object.assign(branding, brandingJson);
    }

    if (script.dataset.accent) theme.accent = script.dataset.accent;
    if (script.dataset.accentHover) theme.accentHover = script.dataset.accentHover;
    if (script.dataset.accentText) theme.accentText = script.dataset.accentText;
    if (script.dataset.surface) theme.surface = script.dataset.surface;
    if (script.dataset.surfaceAlt) theme.surfaceAlt = script.dataset.surfaceAlt;
    if (script.dataset.text) theme.text = script.dataset.text;
    if (script.dataset.textMuted) theme.textMuted = script.dataset.textMuted;
    if (script.dataset.border) theme.border = script.dataset.border;
    if (script.dataset.overlay) theme.overlay = script.dataset.overlay;
    if (script.dataset.userBubble) theme.userBubble = script.dataset.userBubble;
    if (script.dataset.assistantBubble) theme.assistantBubble = script.dataset.assistantBubble;
    if (script.dataset.success) theme.success = script.dataset.success;
    if (script.dataset.danger) theme.danger = script.dataset.danger;
    if (script.dataset.focus) theme.focus = script.dataset.focus;
    if (script.dataset.fontFamily) theme.fontFamily = script.dataset.fontFamily;
    if (script.dataset.radius) theme.radius = script.dataset.radius;
    if (script.dataset.shadow) theme.shadow = script.dataset.shadow;

    if (script.dataset.assistantName) branding.assistantName = script.dataset.assistantName;
    if (script.dataset.launcherLabel) branding.launcherLabel = script.dataset.launcherLabel;
    if (script.dataset.headerTitle) branding.headerTitle = script.dataset.headerTitle;
    if (script.dataset.inputPlaceholder) branding.inputPlaceholder = script.dataset.inputPlaceholder;
    if (script.dataset.humanModeBannerText) branding.humanModeBannerText = script.dataset.humanModeBannerText;
    if (script.dataset.quickChips) {
      branding.quickChips = script.dataset.quickChips
        .split("|")
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
    }
    if (script.dataset.logoMode) branding.logoMode = script.dataset.logoMode;
    if (script.dataset.logoUrl) branding.logoUrl = script.dataset.logoUrl;
    if (script.dataset.logoAlt) branding.logoAlt = script.dataset.logoAlt;

    if (!tenantKey && !placement && Object.keys(theme).length === 0 && Object.keys(branding).length === 0) {
      return shopDomain ? { tenantKey: "", shopDomain: shopDomain, placement: "", theme: theme, branding: branding } : null;
    }

    return { tenantKey: tenantKey, shopDomain: shopDomain, placement: placement, theme: theme, branding: branding };
  }

  function normalizePlacement(value) {
    var raw = String(value || "").trim().toLowerCase();
    return raw === "bottom-left" ? "bottom-left" : "bottom-right";
  }

  function getEdgeStyle(placement) {
    return placement === "bottom-left" ? "left:0" : "right:0";
  }

  function normalizeShopDomain(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      return raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }
  }

  function sanitizeNamespacePart(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function buildStorageNamespace(tenantKey, hostname) {
    var normalizedTenantKey = sanitizeNamespacePart(tenantKey);
    var normalizedHostname = sanitizeNamespacePart(normalizeShopDomain(hostname));
    if (normalizedTenantKey && normalizedHostname) {
      return normalizedTenantKey + ":" + normalizedHostname;
    }
    return normalizedTenantKey || "shop-assist-unresolved";
  }

  function resolveOrigin() {
    var script = getEmbedScript();
    if (script && script.src) {
      try { return new URL(script.src, window.location.href).origin; } catch { /* noop */ }
    }
    var scripts = document.querySelectorAll("script[src]");
    for (var i = 0; i < scripts.length; i++) {
      if (/embed\.js|theme-embed/.test(scripts[i].src || "")) {
        try { return new URL(scripts[i].src).origin; } catch { /* noop */ }
      }
    }
    return "";
  }

  function fetchPublicConfig(origin, shopDomain) {
    if (!origin || !shopDomain) return Promise.resolve(null);
    return fetch(origin + "/api/widget/public-config?shop=" + encodeURIComponent(shopDomain), {
      credentials: "omit",
    })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .catch(function () { return null; });
  }

  var scriptConfig = readScriptConfig();
  var windowConfig =
    window.SHOP_ASSIST_CONFIG && typeof window.SHOP_ASSIST_CONFIG === "object"
      ? window.SHOP_ASSIST_CONFIG
      : null;
  var widgetConfig = mergeConfig(scriptConfig, windowConfig);
  var origin = resolveOrigin();
  var shopDomain = normalizeShopDomain(
    widgetConfig.shopDomain ||
    (window.Shopify && (window.Shopify.shop || window.Shopify.shopDomain)) ||
    window.location.hostname
  );
  var tenantKey = (widgetConfig.tenantKey || "").trim();
  var placement = normalizePlacement(widgetConfig.placement);
  var storageNamespace = buildStorageNamespace(tenantKey, window.location.hostname);

  function scopedStorageKey(base) {
    return storageNamespace + ":" + base;
  }

  function scopedSessionKey(base) {
    return SESSION_STATE_PREFIX + ":" + storageNamespace + ":" + base;
  }

  // ─── Session ID (first-party localStorage) ───────────────────────────
  function getSessionId() {
    var sid = safeGet(scopedStorageKey(STORAGE.SESSION));
    if (!sid) { sid = uid(); safeSet(scopedStorageKey(STORAGE.SESSION), sid); }
    return sid;
  }

  // ─── Shopify Page Context Detection ───────────────────────────────────
  function getShopifyContext() {
    var ctx = { page: "unknown" };

    // 1. Try ShopifyAnalytics.meta (most reliable)
    var sa = window.ShopifyAnalytics;
    var meta = sa && sa.meta;
    if (meta && meta.page) {
      var pt = (meta.page.pageType || "").toLowerCase();
      if (pt === "product")    ctx.page = "pdp";
      else if (pt === "collection") ctx.page = "category";
      else if (pt === "cart")       ctx.page = "cart";
      else if (pt === "search")     ctx.page = "search";
      else if (pt === "home" || pt === "index") ctx.page = "homepage";
    }

    // 2. Fallback: URL pattern matching
    if (ctx.page === "unknown") {
      var path = window.location.pathname;
      if (/^\/products\/.+/.test(path))      ctx.page = "pdp";
      else if (/^\/collections\/.+/.test(path)) ctx.page = "category";
      else if (path === "/cart")                 ctx.page = "cart";
      else if (/^\/search/.test(path))           ctx.page = "search";
      else if (path === "/" || path === "")       ctx.page = "homepage";
    }

    // 3. Product data (PDP)
    if (ctx.page === "pdp") {
      // Try window.meta.product (Shopify Dawn-based themes)
      var mp = window.meta && window.meta.product;
      if (mp) {
        ctx.productName  = mp.title;
        ctx.productId    = mp.id;
        ctx.productVendor = mp.vendor;
        ctx.productType  = mp.type;
        if (mp.variants && mp.variants.length) {
          ctx.productSku   = mp.variants[0].sku;
          ctx.productPrice = "$" + (mp.variants[0].price / 100).toFixed(2);
          var mpVid = mp.variants[0].id;
          if (mpVid != null) {
            var mpN = Number(mpVid);
            if (mpN > 0 && isFinite(mpN)) ctx.productVariantId = mpN;
          }
        }
      }

      // Try ShopifyAnalytics.meta.product
      if (!ctx.productName && meta && meta.product) {
        ctx.productName  = meta.product.title;
        ctx.productId    = meta.product.id;
        ctx.productVendor = meta.product.vendor;
        ctx.productType  = meta.product.type;
        if (meta.product.variants && meta.product.variants.length) {
          ctx.productSku   = meta.product.variants[0].sku;
          ctx.productPrice = "$" + (meta.product.variants[0].price / 100).toFixed(2);
          var saVid = meta.product.variants[0].id;
          if (saVid != null) {
            var saN = Number(saVid);
            if (saN > 0 && isFinite(saN)) ctx.productVariantId = saN;
          }
        }
      }

      // Fallback: scrape from the DOM
      if (!ctx.productName) {
        var titleEl = document.querySelector("h1.product__title, h1.product-title, .product-single__title, h1[data-product-title]");
        if (titleEl) ctx.productName = titleEl.textContent.trim();
      }
      if (!ctx.productPrice) {
        var priceEl = document.querySelector(".product__price .price-item--regular, .product-single__price, [data-product-price], .price--large");
        if (priceEl) ctx.productPrice = priceEl.textContent.trim();
      }

      // Extract product handle from URL for product JSON fetch
      var handleMatch = window.location.pathname.match(/\/products\/([^/?#]+)/);
      if (handleMatch) {
        ctx.productHandle = handleMatch[1];
        ctx.productUrl = window.location.href;
        // Final fallback: derive a readable product name from the URL handle
        // (e.g. "beautyrest-harmony-lux" -> "Beautyrest Harmony Lux")
        if (!ctx.productName) {
          ctx.productName = handleMatch[1]
            .replace(/-/g, " ")
            .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        }
      }
    }

    // 4. Collection/Category data
    if (ctx.page === "category") {
      var collTitle = document.querySelector("h1.collection__title, h1.collection-hero__title, h1");
      if (collTitle) ctx.category = collTitle.textContent.trim();
      // Fallback from URL
      if (!ctx.category) {
        var collMatch = window.location.pathname.match(/\/collections\/([^/?#]+)/);
        if (collMatch) ctx.category = collMatch[1].replace(/-/g, " ");
      }
    }

    // 5. Search query
    if (ctx.page === "search") {
      ctx.searchQuery = new URLSearchParams(window.location.search).get("q") || "";
    }

    return ctx;
  }

  // Fetch enriched product data from Shopify JSON endpoint (async)
  function fetchProductDetails(handle, callback) {
    if (!handle) return;
    fetch("/products/" + handle + ".json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.product) {
          var p = data.product;
          var out = {
            productDescription: stripHtml(p.body_html || "").slice(0, 500),
            productImage: p.images && p.images.length ? p.images[0].src : undefined,
            productTags: p.tags ? p.tags.split(", ").slice(0, 10) : [],
          };
          if (p.variants && p.variants.length && p.variants[0].id != null) {
            var jsonN = Number(p.variants[0].id);
            if (jsonN > 0 && isFinite(jsonN)) out.productVariantId = jsonN;
          }
          callback(out);
        }
      })
      .catch(function () { /* not critical */ });
  }

  // Fetch Shopify cart
  function fetchCart(callback) {
    fetch("/cart.js")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cart) {
        if (cart && cart.items) {
          callback({
            cartItems: cart.items.map(function (i) {
              return i.title + (i.variant_title ? " — " + i.variant_title : "");
            }),
            cartTotal: "$" + (cart.total_price / 100).toFixed(2),
            cartCount: cart.item_count,
          });
        }
      })
      .catch(function () { /* not critical */ });
  }

  function stripHtml(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
  }

  // ─── Browsing History ─────────────────────────────────────────────────
  function getBrowsingHistory() {
    return safeJSON(safeGet(scopedStorageKey(STORAGE.HISTORY))) || [];
  }

  function trackPageView(ctx) {
    if (ctx.page !== "pdp" || !ctx.productName) return;
    var history = getBrowsingHistory();

    // Remove duplicate
    history = history.filter(function (h) { return h.productName !== ctx.productName; });

    // Add to front
    history.unshift({
      productName: ctx.productName,
      productPrice: ctx.productPrice || "",
      productUrl: ctx.productUrl || window.location.href,
      viewedAt: new Date().toISOString(),
    });

    // Trim
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);

    safeSet(scopedStorageKey(STORAGE.HISTORY), JSON.stringify(history));
  }

  // ─── Visitor Profile ──────────────────────────────────────────────────
  function getVisitorProfile() {
    return safeJSON(safeGet(scopedStorageKey(STORAGE.PROFILE))) || null;
  }

  // ─── Shared Chat ─────────────────────────────────────────────────────
  // Two formats supported:
  //   ?chat=<gzip+base64url>  — self-contained (works across browsers)
  //   ?c=<short-id>           — server-side lookup (in-memory, best effort)
  function getSharedChatInput() {
    var params = new URLSearchParams(window.location.search);
    var chatData = params.get("chat");
    var shortId = params.get("c");
    if (!chatData && !shortId) return null;

    var clean = new URL(window.location.href);
    clean.searchParams.delete("chat");
    clean.searchParams.delete("c");
    history.replaceState(null, "", clean.toString());

    return { chatData: chatData, shortId: shortId };
  }

  // Gzip-decompress a URL-safe base64 string → JSON string
  function decompressChat(encoded) {
    var b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    var stream = new Blob([bytes]).stream().pipeThrough(
      new DecompressionStream("gzip")
    );
    return new Response(stream).text();
  }

  function resolveSharedChat(origin, input, callback) {
    // Try the self-contained compressed data first
    if (input.chatData) {
      decompressChat(input.chatData)
        .then(function (json) {
          var arr = JSON.parse(json);
          if (Array.isArray(arr)) {
            callback(arr.map(function (m, i) {
              return { id: "shared-" + i, role: m.role, text: m.text };
            }));
          } else { callback(null); }
        })
        .catch(function () { callback(null); });
      return;
    }

    // Fallback: short-id server lookup
    if (input.shortId) {
      fetch(origin + "/api/share/" + encodeURIComponent(input.shortId))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && Array.isArray(data.messages)) {
            callback(data.messages.map(function (m, i) {
              return { id: "shared-" + i, role: m.role, text: m.text };
            }));
          } else { callback(null); }
        })
        .catch(function () { callback(null); });
      return;
    }

    callback(null);
  }

  // ─── Main Inject ──────────────────────────────────────────────────────
  function inject() {
    if (!origin) return;

    var sessionId = getSessionId();
    var pageContext = getShopifyContext();
    trackPageView(pageContext);

    // ─── Session tracking (State 3 & State 4) ─────────────────────────
    // sessionStorage is host-page scoped, cleared when ALL tabs close.
    function getSessionVal(k) {
      try { return sessionStorage.getItem(k); } catch { return null; }
    }
    function setSessionVal(k, v) {
      try { sessionStorage.setItem(k, v); } catch { /* noop */ }
    }
    // Sessions are bounded — if the tab has been open for more than 6
    // hours (browser left idle overnight, etc.), treat it as a new
    // session. Otherwise State 3's interjection thresholds (1m / 3m / 8m
    // from sessionStartedAt) would all be "already exceeded" and fire
    // immediately on any interaction.
    var MAX_SESSION_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
    var isNewSession = !getSessionVal(scopedSessionKey("marker"));
    var sessionStartedAt;
    if (!isNewSession) {
      var existingStartedAt = parseInt(getSessionVal(scopedSessionKey("started_at")) || "0", 10);
      if (!existingStartedAt || (Date.now() - existingStartedAt) > MAX_SESSION_AGE_MS) {
        // Session went stale — reset as if it were a new session.
        isNewSession = true;
      }
    }
    if (isNewSession) {
      sessionStartedAt = Date.now();
      setSessionVal(scopedSessionKey("marker"), "1");
      setSessionVal(scopedSessionKey("started_at"), String(sessionStartedAt));
      setSessionVal(scopedSessionKey("state3_count"), "0");
      setSessionVal(scopedSessionKey("last_interjection_at"), "0");
    } else {
      sessionStartedAt = parseInt(getSessionVal(scopedSessionKey("started_at")) || String(Date.now()), 10);
    }

    // Multi-tab greeting lock: sessionStorage is per-tab, so opening a
    // second tab would otherwise trigger another State 4 greeting. Use a
    // shared localStorage timestamp to suppress greetings within 60s.
    var LAST_GREETING_KEY = scopedStorageKey("last_greeting_at");
    var GREETING_COOLDOWN_MS = 60_000;
    if (isNewSession) {
      var lastGreetingAt = parseInt(safeGet(LAST_GREETING_KEY) || "0", 10);
      if (Date.now() - lastGreetingAt < GREETING_COOLDOWN_MS) {
        // Another tab greeted very recently — suppress the greeting in this tab
        isNewSession = false;
      } else {
        safeSet(LAST_GREETING_KEY, String(Date.now()));
      }
    }
    function getState3Count() {
      return parseInt(getSessionVal(scopedSessionKey("state3_count")) || "0", 10);
    }
    function incState3Count() {
      var n = getState3Count() + 1;
      setSessionVal(scopedSessionKey("state3_count"), String(n));
      return n;
    }

    // ── Create iframe ──
    var iframe = document.createElement("iframe");
    iframe.src = origin + "/embed?tenantKey=" + encodeURIComponent(tenantKey);
    iframe.title =
      (widgetConfig.branding && (widgetConfig.branding.headerTitle || widgetConfig.branding.launcherLabel))
      || "Shopping Assistant";
    // Start small (just enough for the toggle button), expand when widget opens
    var CLOSED_STYLE = [
      "position:fixed",
      "bottom:0",
      getEdgeStyle(placement),
      "width:300px",
      "height:90px",
      "border:0",
      "z-index:2147483647",
      "background:transparent",
      "transition:width 0.3s ease, height 0.3s ease",
    ].join(";");

    var OPEN_STYLE = [
      "position:fixed",
      "bottom:0",
      getEdgeStyle(placement),
      "width:min(440px,100vw)",
      "height:min(720px,100vh)",
      "max-width:100vw",
      "max-height:100vh",
      "border:0",
      "z-index:2147483647",
      "background:transparent",
      "transition:width 0.3s ease, height 0.3s ease",
    ].join(";");

    // Restore previous widget open/closed state so the iframe loads at the
    // right size (no flash of the small pill when the chat was open).
    var wasOpen = safeGet(scopedStorageKey(STORAGE.WIDGET_OPEN)) === "1";
    iframe.setAttribute("style", wasOpen ? OPEN_STYLE : CLOSED_STYLE);
    iframe.setAttribute("allow", "clipboard-write");

    var ready = false;

    function sendToIframe(payload) {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.postMessage(payload, origin);
    }

    // When iframe signals ready, send the full init payload
    function handleReady() {
      ready = true;

      var sharedInput = getSharedChatInput();
      var localChat = safeJSON(safeGet(scopedStorageKey(STORAGE.CHAT)));
      var pending = safeJSON(safeGet(scopedStorageKey(STORAGE.PENDING)));
      var profile = getVisitorProfile();
      var history = getBrowsingHistory();

      function sendInit(chatMessages, isSharedChat) {
        sendToIframe({
          type: "shop-assist-init",
          sessionId: sessionId,
          chatMessages: chatMessages,
          pageContext: pageContext,
          browsingHistory: history,
          pendingProduct: pending,
          visitorProfile: profile,
          isSharedChat: !!isSharedChat,
          widgetOpen: wasOpen,
          isNewSession: isNewSession,
          suppressReturning: safeGet(scopedStorageKey(STORAGE.SUPPRESS_RETURNING)) === "1",
          tenantKey: tenantKey,
          storageNamespace: storageNamespace,
          hostOrigin: window.location.origin,
          theme: widgetConfig.theme,
          branding: widgetConfig.branding,
        });
        // Only fire State 4 greeting on the first tab's first load — not
        // on subsequent loads in the same session.
        isNewSession = false;
        // Kick off State 3 scheduler if chat is closed
        if (!chatIsOpen) startState3();
      }

      if (sharedInput) {
        resolveSharedChat(origin, sharedInput, function (sharedMessages) {
          if (sharedMessages && sharedMessages.length > 0) {
            sendInit(sharedMessages, true);
          } else {
            // Decode failed or expired — fall back to local chat
            sendInit(localChat, false);
          }
        });
      } else {
        sendInit(localChat, false);
      }

      // Clear pending product after sending
      if (pending) safeRemove(scopedStorageKey(STORAGE.PENDING));

      // Fetch enriched product details (async) and send as update
      if (pageContext.productHandle) {
        fetchProductDetails(pageContext.productHandle, function (details) {
          pageContext = Object.assign(pageContext, details);
          sendToIframe({ type: MSG_CONTEXT, context: pageContext });
        });
      }

      // Fetch cart data (async) and send as update
      fetchCart(function (cartData) {
        pageContext = Object.assign(pageContext, cartData);
        sendToIframe({ type: MSG_CONTEXT, context: pageContext });
      });
    }

    // ── Message listener ──
    window.addEventListener("message", function (e) {
      if (e.origin !== origin) return;
      if (!e.data || typeof e.data.type !== "string") return;

      switch (e.data.type) {
        case "shop-assist-embed-ready":
          handleReady();
          break;

        case "shop-assist-navigate":
          // Save pending product before navigating
          if (e.data.pendingProduct) {
            safeSet(scopedStorageKey(STORAGE.PENDING), JSON.stringify(e.data.pendingProduct));
          }
          if (typeof e.data.url === "string") {
            window.location.href = e.data.url;
          }
          break;

        case "shop-assist-save-messages":
          if (e.data.messages) {
            safeSet(scopedStorageKey(STORAGE.CHAT), JSON.stringify(e.data.messages));
          }
          break;

        case "shop-assist-save-profile":
          if (e.data.profile) {
            safeSet(scopedStorageKey(STORAGE.PROFILE), JSON.stringify(e.data.profile));
          }
          break;

        case "shop-assist-clear-messages":
          safeRemove(scopedStorageKey(STORAGE.CHAT));
          break;

        case "shop-assist-set-suppress-returning":
          // Customer clicked in-chat refresh — suppress returning-style
          // greetings until they actually send a message.
          safeSet(scopedStorageKey(STORAGE.SUPPRESS_RETURNING), "1");
          break;

        case "shop-assist-clear-suppress-returning":
          // Customer just sent their first message after a refresh —
          // they're engaging again, so personalization can resume.
          safeRemove(scopedStorageKey(STORAGE.SUPPRESS_RETURNING));
          break;

        case "shop-assist-widget-open":
          iframe.setAttribute("style", OPEN_STYLE);
          safeSet(scopedStorageKey(STORAGE.WIDGET_OPEN), "1");
          chatIsOpen = true;
          stopState3();
          break;

        case "shop-assist-widget-close":
          iframe.setAttribute("style", CLOSED_STYLE);
          safeSet(scopedStorageKey(STORAGE.WIDGET_OPEN), "0");
          chatIsOpen = false;
          // Option A: restart the State 3 schedule from the close moment.
          // The user explicitly closed — don't pop open again right away
          // just because the session has already been long enough to meet
          // a threshold. Next interjection waits from "now" under the same
          // escalating cadence (1m / 3m / 8m for counts 0 / 1 / 2).
          sessionStartedAt = Date.now();
          setSessionVal(scopedSessionKey("started_at"), String(sessionStartedAt));
          startState3();
          break;

        case "shop-assist-add-to-cart": {
          var rawId = e.data.variantId;
          var vid =
            typeof rawId === "number" && rawId === Math.floor(rawId)
              ? rawId
              : parseInt(String(rawId || ""), 10);
          var qtyRaw = e.data.quantity;
          var qty =
            typeof qtyRaw === "number" && qtyRaw === Math.floor(qtyRaw) && qtyRaw >= 1
              ? qtyRaw
              : parseInt(String(qtyRaw == null ? "1" : qtyRaw), 10);
          if (!qty || qty < 1 || qty > 99) qty = 1;
          if (!vid || vid < 1 || !isFinite(vid)) {
            if (ready) {
              sendToIframe({
                type: "shop-assist-cart-action-result",
                action: "add",
                ok: false,
                error: "Invalid variant id",
              });
            }
            break;
          }
          fetch("/cart/add.js", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ items: [{ id: vid, quantity: qty }] }),
          })
            .then(function (r) {
              return r.text().then(function (t) {
                var body = {};
                if (t) {
                  try {
                    body = JSON.parse(t);
                  } catch {
                    body = { message: t.slice(0, 200) };
                  }
                }
                return { ok: r.ok, body: body };
              });
            })
            .then(function (res) {
              var errMsg;
              if (!res.ok && res.body) {
                errMsg =
                  res.body.description ||
                  res.body.message ||
                  (typeof res.body === "string" ? res.body : null);
              }
              if (ready) {
                sendToIframe({
                  type: "shop-assist-cart-action-result",
                  action: "add",
                  ok: res.ok,
                  error: res.ok ? undefined : errMsg || "Add to cart failed",
                });
              }
              if (res.ok) {
                fetchCart(function (cartData) {
                  pageContext = Object.assign(pageContext, cartData);
                  if (ready) {
                    sendToIframe({ type: MSG_CONTEXT, context: pageContext });
                  }
                });
                // Dispatch multiple cart-refresh events covering the
                // most common Shopify theme conventions. Themes listen
                // for different names; fire all of them so the cart
                // drawer/icon refreshes without a full page reload.
                var cartEvents = [
                  "cart:updated",
                  "cart:refresh",
                  "cart:change",
                  "cart:rerender",
                  "shopify:cart:update",
                  "shopify:section:load",
                ];
                cartEvents.forEach(function (name) {
                  try {
                    document.documentElement.dispatchEvent(
                      new CustomEvent(name, { bubbles: true, detail: res.body || {} })
                    );
                    document.dispatchEvent(
                      new CustomEvent(name, { bubbles: true, detail: res.body || {} })
                    );
                  } catch { /* older browsers */ }
                });
                // Also try the most common theme-defined JS refresh hooks.
                try {
                  // Dawn / Online Store 2.0
                  if (window.Shopify && typeof window.Shopify.onCartUpdate === "function") {
                    window.Shopify.onCartUpdate(res.body);
                  }
                  // CartJS library (used by some themes)
                  if (window.CartJS && typeof window.CartJS.getCart === "function") {
                    window.CartJS.getCart();
                  }
                } catch { /* ignore */ }
              }
            })
            .catch(function () {
              if (ready) {
                sendToIframe({
                  type: "shop-assist-cart-action-result",
                  action: "add",
                  ok: false,
                  error: "Network error",
                });
              }
            });
          break;
        }

        case "shop-assist-checkout":
          window.location.href = "/checkout";
          break;
      }
    });

    // ── SPA navigation detection (Shopify themes with AJAX) ──
    var lastUrl = window.location.href;
    function onUrlChange() {
      var newUrl = window.location.href;
      if (newUrl === lastUrl) return;
      lastUrl = newUrl;
      lastNavAt = Date.now(); // reset State 3 navigation guard

      // Re-detect context after a short delay (DOM needs to update)
      setTimeout(function () {
        pageContext = getShopifyContext();
        trackPageView(pageContext);
        if (ready) {
          sendToIframe({ type: MSG_CONTEXT, context: pageContext });

          // Fetch product details if on a new PDP
          if (pageContext.productHandle) {
            fetchProductDetails(pageContext.productHandle, function (details) {
              pageContext = Object.assign(pageContext, details);
              sendToIframe({ type: MSG_CONTEXT, context: pageContext });
            });
          }
        }
      }, 500);
    }

    // Intercept pushState/replaceState for SPA navigation
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function () {
      origPush.apply(this, arguments);
      onUrlChange();
    };
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      onUrlChange();
    };
    window.addEventListener("popstate", onUrlChange);

    // ── Activity tracking (throttled) — for IDLE/re-engagement detection ──
    var lastActivitySent = 0;
    var lastNavAt = Date.now(); // fresh page load = navigation
    function onActivity() {
      var now = Date.now();
      if (now - lastActivitySent < 5000) return; // throttle to one pulse per 5s
      lastActivitySent = now;
      if (ready) sendToIframe({ type: "shop-assist-activity", at: now });
    }
    ["mousemove", "scroll", "click", "keydown", "touchstart"].forEach(function (evt) {
      window.addEventListener(evt, onActivity, { passive: true });
    });

    // ── State 3 scheduler (BROWSING_CHAT_CLOSED) ──────────────────────
    // First 3 interjections at 20s / 40s / 60s from the "clock baseline"
    // (which is either session start or the moment the chat was closed/
    // minimized). After that, no cap — fire every 2 minutes measured
    // from the last interjection.
    var STATE3_THRESHOLDS = [20_000, 40_000, 60_000];
    var STATE3_RECURRING_GAP_MS = 120_000; // 2 min after the 3rd
    var STATE3_CHECK_INTERVAL = 5_000;     // tighter so 20s is accurate
    var STATE3_NAV_GUARD_MS = 8_000;
    var STATE3_LAST_INTERJECTION_KEY = scopedSessionKey("last_interjection_at");

    function getLastInterjectionAt() {
      return parseInt(getSessionVal(STATE3_LAST_INTERJECTION_KEY) || "0", 10);
    }
    function setLastInterjectionAt(t) {
      setSessionVal(STATE3_LAST_INTERJECTION_KEY, String(t));
    }

    var chatIsOpen = safeGet(scopedStorageKey(STORAGE.WIDGET_OPEN)) === "1";
    var state3Interval = null;

    // Heuristic: which interjection type fits the current browsing/chat state?
    function pickInterjectionType() {
      var chatMessages = safeJSON(safeGet(scopedStorageKey(STORAGE.CHAT))) || [];
      var userMsgs = chatMessages.filter(function (m) { return m && m.role === "user"; });
      var productsViewed = getBrowsingHistory().length;
      var isPdp = pageContext && pageContext.page === "pdp" && pageContext.productName;

      // Rich prior chat → resume
      if (userMsgs.length >= 2) return "resume";
      // On a PDP right now → inform
      if (isPdp) return "inform";
      // 2+ products viewed in this session → compare
      if (productsViewed >= 2) return "compare";
      // 1 product viewed (near-decision) → social proof
      if (productsViewed === 1) return "social";
      // Default → guide (quiz-style narrowing)
      return "guide";
    }

    // Hard rule: NEVER interrupt cart/checkout flows. We check both the
    // scraped pageContext and the URL path (Shopify checkout uses a
    // dedicated domain but the pattern holds for in-theme flows).
    function isSafePageForInterjection() {
      if (pageContext && pageContext.page === "cart") return false;
      var path = window.location.pathname || "";
      if (/^\/cart(\/|$)/.test(path)) return false;
      if (/\/checkouts?\//.test(path)) return false;
      if (/\/checkout($|\/)/.test(path)) return false;
      return true;
    }

    function checkState3() {
      if (chatIsOpen || !ready) return;
      if (!isSafePageForInterjection()) return; // Skip cart/checkout
      var count = getState3Count();
      var now = Date.now();

      // For the first three interjections, use the absolute-from-baseline
      // threshold (20s, 40s, 60s). After that, require 2 minutes to have
      // passed since the PREVIOUS interjection (relative pacing). No cap.
      if (count < STATE3_THRESHOLDS.length) {
        var elapsed = now - sessionStartedAt;
        if (elapsed < STATE3_THRESHOLDS[count]) return;
      } else {
        var lastAt = getLastInterjectionAt();
        if (lastAt && (now - lastAt) < STATE3_RECURRING_GAP_MS) return;
      }
      // Guard: don't interrupt right after a navigation
      if (now - lastNavAt < STATE3_NAV_GUARD_MS) return;
      incState3Count();
      setLastInterjectionAt(now);
      sendToIframe({
        type: "shop-assist-interjection",
        interjectionType: pickInterjectionType(),
      });
    }
    function startState3() {
      if (state3Interval || chatIsOpen) return;
      state3Interval = setInterval(checkState3, STATE3_CHECK_INTERVAL);
      // One immediate check in case a threshold is already overdue
      setTimeout(checkState3, 500);
    }
    function stopState3() {
      if (state3Interval) { clearInterval(state3Interval); state3Interval = null; }
    }

    // ── Append iframe ──
    document.body.appendChild(iframe);

    // ── Public API (optional) ──
    window.ShopAssistEmbed = {
      version: 2,
      origin: origin,
      setContext: function (ctx) {
        if (!ctx || typeof ctx !== "object") return;
        pageContext = Object.assign(pageContext, ctx);
        if (ready) sendToIframe({ type: MSG_CONTEXT, context: pageContext });
      },
      getIframe: function () { return iframe; },
    };
  }

  function start() {
    if (widgetConfig.tenantKey || !shopDomain || !origin) {
      tenantKey = (widgetConfig.tenantKey || "").trim();
      if (!tenantKey) {
        console.error("Shop Assist widget: missing tenantKey and no shop domain mapping was available.");
        return;
      }
      storageNamespace = buildStorageNamespace(tenantKey, window.location.hostname);
      inject();
      return;
    }

    fetchPublicConfig(origin, shopDomain).then(function (publicConfig) {
      if (publicConfig && typeof publicConfig === "object") {
        widgetConfig = mergeConfig(publicConfig, widgetConfig);
      }
      tenantKey = (widgetConfig.tenantKey || "").trim();
      if (!tenantKey && shopDomain) {
        console.error("Shop Assist widget: no tenant mapping found for shop domain", shopDomain);
        return;
      }
      if (!tenantKey) {
        console.error("Shop Assist widget: missing tenantKey and no shop domain mapping was available.");
        return;
      }
      storageNamespace = buildStorageNamespace(tenantKey, window.location.hostname);
      inject();
    });
  }

  // ── Boot ──
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
