"use client";

import { useEffect } from "react";

export function ShopifyAuthRedirect({
  installUrl,
  shop,
}: {
  installUrl: string;
  shop: string;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const navigateTop = () => {
      try {
        window.open(installUrl, "_top");
        return true;
      } catch {
        return false;
      }
    };

    try {
      if (window.top && window.top !== window) {
        if (!navigateTop()) {
          window.top.location.assign(installUrl);
        }
        return;
      }
    } catch {
      // Fall through to same-window navigation.
    }

    if (!navigateTop()) {
      window.location.assign(installUrl);
    }
  }, [installUrl]);

  return (
    <main className="min-h-screen px-6 py-10" style={{ background: "var(--widget-surface-alt)" }}>
      <div
        className="mx-auto max-w-2xl rounded-3xl border p-8 text-center"
        style={{ background: "var(--widget-surface)", borderColor: "var(--widget-border)" }}
      >
        <h1 className="text-3xl font-semibold" style={{ color: "var(--widget-text)" }}>
          Connecting Shopify
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--widget-text-muted)" }}>
          Finishing setup for {shop}. If nothing happens in a moment, continue below.
        </p>
        <div className="mt-6">
          <a
            href={installUrl}
            target="_top"
            rel="noreferrer"
            className="rounded-2xl px-4 py-3 text-sm font-semibold"
            style={{ background: "var(--widget-accent)", color: "var(--widget-accent-text)" }}
          >
            Continue setup
          </a>
        </div>
      </div>
    </main>
  );
}
