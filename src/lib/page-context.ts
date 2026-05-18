import type { PageContext, BrowsingHistoryEntry } from "@/lib/system-prompt";

/** Parent → iframe postMessage type (see public/embed.js). */
export const SHOP_ASSIST_PAGE_CONTEXT_MESSAGE = "shop-assist-page-context-update" as const;

const PAGE_TYPES = new Set<PageContext["page"]>([
  "pdp",
  "category",
  "cart",
  "homepage",
  "search",
  "unknown",
]);

function str(v: unknown, max = 4000): string | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  return v.length > max ? v.slice(0, max) : v;
}

function strArr(v: unknown, maxItems = 40, maxLen = 400): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .map((x) => (x.length > maxLen ? x.slice(0, maxLen) : x))
    .slice(0, maxItems);
  return out.length ? out : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function historyArr(v: unknown): BrowsingHistoryEntry[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: BrowsingHistoryEntry[] = [];
  for (const item of v.slice(0, 30)) {
    if (!item || typeof item !== "object") continue;
    const name = typeof item.productName === "string" ? item.productName : "";
    if (!name) continue;
    out.push({
      productName: name.slice(0, 200),
      productPrice: typeof item.productPrice === "string" ? item.productPrice.slice(0, 20) : undefined,
      productUrl: typeof item.productUrl === "string" ? item.productUrl.slice(0, 500) : undefined,
      viewedAt: typeof item.viewedAt === "string" ? item.viewedAt : new Date().toISOString(),
    });
  }
  return out.length ? out : undefined;
}

/**
 * Validates data from the parent page (postMessage) before merging into
 * `window.SHOP_ASSIST_CONTEXT`. Rejects prototype pollution and oversized values.
 */
export function sanitizeHostPageContext(raw: unknown): PageContext | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const pageRaw = o.page;
  const page: PageContext["page"] =
    typeof pageRaw === "string" && PAGE_TYPES.has(pageRaw as PageContext["page"])
      ? (pageRaw as PageContext["page"])
      : "unknown";

  let dwellThreshold: number | undefined;
  if (typeof o.dwellThreshold === "number" && Number.isFinite(o.dwellThreshold)) {
    const t = Math.floor(o.dwellThreshold);
    if (t >= 0 && t <= 86_400_000) dwellThreshold = t;
  }

  const vidRaw = num(o.productVariantId);
  const productVariantId =
    vidRaw !== undefined && vidRaw === Math.floor(vidRaw) && vidRaw > 0
      ? vidRaw
      : undefined;

  const out: PageContext = {
    page,
    productName: str(o.productName),
    productVariantId,
    productSku: str(o.productSku),
    productPrice: str(o.productPrice, 20),
    productVendor: str(o.productVendor, 200),
    productType: str(o.productType, 200),
    productDescription: str(o.productDescription, 500),
    productImage: str(o.productImage, 500),
    productUrl: str(o.productUrl, 500),
    productTags: strArr(o.productTags, 20, 100),
    category: str(o.category),
    cartItems: strArr(o.cartItems),
    cartTotal: str(o.cartTotal, 20),
    cartCount: num(o.cartCount),
    searchQuery: str(o.searchQuery),
    pageHistory: strArr(o.pageHistory),
    purchasedProducts: strArr(o.purchasedProducts),
    browsingHistory: historyArr(o.browsingHistory),
  };

  if (typeof o.dwellSeconds === "number" && Number.isFinite(o.dwellSeconds) && o.dwellSeconds >= 0 && o.dwellSeconds < 86400) {
    out.dwellSeconds = Math.floor(o.dwellSeconds);
  }

  if (dwellThreshold !== undefined) {
    out.dwellThreshold = dwellThreshold;
  }

  return out;
}

/** Only accept context updates from the embedding page's window, not random frames. */
export function isAllowedContextMessageSource(
  source: MessageEvent["source"]
): boolean {
  if (source == null) return false;
  if (typeof window === "undefined") return false;
  if (window.parent !== window) {
    return source === window.parent;
  }
  return source === window;
}
