import { NextRequest } from "next/server";
import { ensureTenantForShopifyStorefront } from "@/lib/tenant-platform";
import { normalizeShopifyShopDomain } from "@/lib/shopify";

function clean(value: string | null | undefined): string {
  return String(value || "").trim();
}

function hostnameFromUrl(value: string | null | undefined): string {
  const raw = clean(value).toLowerCase();
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function normalizePlacement(value: string | null | undefined): "bottom-right" | "bottom-left" | undefined {
  const raw = clean(value).toLowerCase();
  return raw === "bottom-left" || raw === "bottom-right" ? raw : undefined;
}

export async function GET(request: NextRequest) {
  const shop = normalizeShopifyShopDomain(request.nextUrl.searchParams.get("shop"));
  if (!shop) {
    return new Response("console.error('Shop Assist theme embed: missing or invalid shop parameter.');", {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
      },
      status: 400,
    });
  }

  const storefrontDomain = hostnameFromUrl(request.headers.get("referer"));
  let tenantKey = "";

  try {
    const tenant = await ensureTenantForShopifyStorefront({
      shopDomain: shop,
      storefrontDomain,
    });
    tenantKey = tenant?.tenantKey || "";
  } catch (error) {
    console.error("[shopify-theme-embed] Failed to ensure tenant mapping", error);
  }

  const origin = request.nextUrl.origin;
  const scriptUrl = new URL("/embed.js", origin);
  scriptUrl.searchParams.set("shop", shop);

  const config = {
    tenantKey: tenantKey || undefined,
    shopDomain: shop,
    placement: normalizePlacement(request.nextUrl.searchParams.get("placement")),
    theme: {
      accent: clean(request.nextUrl.searchParams.get("accent")) || undefined,
      accentText: clean(request.nextUrl.searchParams.get("accentText")) || undefined,
      bgPrimary: clean(request.nextUrl.searchParams.get("bgPrimary")) || undefined,
      bgPrimaryText: clean(request.nextUrl.searchParams.get("bgPrimaryText")) || undefined,
      bgSecondary: clean(request.nextUrl.searchParams.get("bgSecondary")) || undefined,
      bgSecondaryText: clean(request.nextUrl.searchParams.get("bgSecondaryText")) || undefined,
    },
    branding: {
      launcherLabel: clean(request.nextUrl.searchParams.get("launcherLabel")) || undefined,
      headerTitle: clean(request.nextUrl.searchParams.get("headerTitle")) || undefined,
      assistantName: clean(request.nextUrl.searchParams.get("assistantName")) || undefined,
      inputPlaceholder: clean(request.nextUrl.searchParams.get("inputPlaceholder")) || undefined,
    },
  };

  const body = `
(function () {
  var cfg = ${JSON.stringify(config)};
  window.SHOP_ASSIST_CONFIG = Object.assign({}, window.SHOP_ASSIST_CONFIG || {}, cfg, {
    theme: Object.assign({}, (window.SHOP_ASSIST_CONFIG && window.SHOP_ASSIST_CONFIG.theme) || {}, cfg.theme || {}),
    branding: Object.assign({}, (window.SHOP_ASSIST_CONFIG && window.SHOP_ASSIST_CONFIG.branding) || {}, cfg.branding || {})
  });
  var script = document.createElement('script');
  script.src = ${JSON.stringify(scriptUrl.toString())};
  script.defer = true;
  script.setAttribute('data-shop', ${JSON.stringify(shop)});
  document.head.appendChild(script);
})();`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}
