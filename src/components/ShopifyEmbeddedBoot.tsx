"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
    };
  }
}

async function fetchWithShopifySessionToken(url: string): Promise<Response> {
  if (typeof window.shopify?.idToken === "function") {
    const token = await window.shopify.idToken();
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  }

  return fetch(url, { cache: "no-store" });
}

export function ShopifyEmbeddedBoot() {
  useEffect(() => {
    let cancelled = false;

    async function authenticateEmbeddedSession() {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
        try {
          if (typeof window.shopify?.idToken !== "function") {
            await new Promise((resolve) => window.setTimeout(resolve, 250));
            continue;
          }

          const response = await fetchWithShopifySessionToken("/api/shopify/auth");
          if (response.ok) {
            return;
          }
        } catch {
          // Retry while App Bridge initializes inside the admin iframe.
        }

        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    }

    void authenticateEmbeddedSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
