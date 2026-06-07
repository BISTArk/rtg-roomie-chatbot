"use client";

import { useEffect, useState } from "react";
import {
  clearInterjectionDismissed,
  INTERJECTION_DISMISSED_KEY,
  INTERJECTION_TYPES,
  postInterjectionTrigger,
  type InterjectionType,
} from "@/lib/interjection";
import { getScopedStorageKey } from "@/lib/browser-session";

const PRESETS = {
  "First visit (no context)": {},
  "Browsing mattresses": {
    page: "category",
    category: "mattresses",
  },
  "On a product page": {
    page: "pdp",
    productName: "Beautyrest Harmony Lux",
    productSku: "BRT-HRM-LUX-Q",
    productVariantId: 98765432100,
    category: "mattresses",
  },
  "Returning — viewed 3 products": {
    page: "category",
    category: "mattresses",
    pageHistory: [
      "/mattresses/beautyrest-harmony",
      "/mattresses/sealy-posturepedic",
      "/mattresses/tempur-pedic-adapt",
    ],
  },
  "Has items in cart": {
    page: "cart",
    cartItems: ["Sealy Posturepedic Plus — Queen"],
    category: "mattresses",
  },
  "Previous purchaser": {
    page: "homepage",
    purchasedProducts: ["Beautyrest Harmony Lux — Queen"],
  },
  "Searching": {
    page: "search",
    searchQuery: "firm mattress for back pain",
    category: "mattresses",
  },
};

export function MockContextPanel() {
  const [selectedPreset, setSelectedPreset] = useState("");
  const [applied, setApplied] = useState("");
  const [mockContext, setMockContext] = useState<
    (typeof PRESETS)[keyof typeof PRESETS] | null
  >(null);

  useEffect(() => {
    if (mockContext) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SHOP_ASSIST_CONTEXT = { ...mockContext };
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).SHOP_ASSIST_CONTEXT;
  }, [mockContext]);

  const applyPreset = (name: string) => {
    const preset = PRESETS[name as keyof typeof PRESETS];
    if (!preset) return;

    setMockContext(preset);
    setSelectedPreset(name);
    setApplied(name);

    // If preset has purchasedProducts, also update the visitor profile cookie
    if ("purchasedProducts" in preset && preset.purchasedProducts) {
      // Trigger a visit record with the purchase data
      window.postMessage(
        {
          type: "shop-assist-page-context-update",
          context: preset,
        },
        "*"
      );
    }
  };

  const clearContext = () => {
    setMockContext(null);
    setSelectedPreset("");
    setApplied("");
    // Clear visitor profile cookie
    document.cookie = "shop_assist_visitor_profile=;path=/;max-age=0";
    document.cookie = "shop_assist_proactive_dismissed=;path=/;max-age=0";
    clearInterjectionDismissed(getScopedStorageKey(INTERJECTION_DISMISSED_KEY));
  };

  const triggerInterjection = (type: InterjectionType) => {
    postInterjectionTrigger(type);
  };

  return (
    <div
      className="mt-8 rounded-xl border p-4"
      style={{
        maxWidth: 480,
        borderColor: "var(--widget-border)",
        backgroundColor: "var(--widget-surface)",
      }}
    >
      <h3
        className="mb-2 text-sm font-semibold"
        style={{ color: "var(--widget-text)" }}
      >
        🧪 Test Panel — Simulate Page Context
      </h3>
      <p className="mb-3 text-xs" style={{ color: "var(--widget-text-muted)" }}>
        Set <code>window.SHOP_ASSIST_CONTEXT</code> to simulate different storefront pages.
        Refresh the chat widget after changing.
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            onClick={() => applyPreset(name)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={{
              borderColor:
                selectedPreset === name
                  ? "var(--widget-accent)"
                  : "var(--widget-border)",
              backgroundColor:
                selectedPreset === name ? "var(--widget-accent)" : "var(--widget-surface)",
              color: selectedPreset === name ? "var(--widget-accent-text)" : "var(--widget-text)",
            }}
          >
            {name}
          </button>
        ))}
        <button
          onClick={clearContext}
          className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
          style={{
            borderColor: "var(--widget-border)",
            color: "var(--widget-text-muted)",
          }}
        >
          ✕ Clear all
        </button>
      </div>
      {applied && (
        <p
          className="mt-2 text-xs"
          style={{ color: "var(--widget-text-muted)" }}
        >
          ✓ Applied: <strong>{applied}</strong> — now open/refresh the chat
          widget
        </p>
      )}

      <div
        className="mt-4 border-t pt-4"
        style={{ borderColor: "var(--widget-border)" }}
      >
        <h3
          className="mb-2 text-sm font-semibold"
          style={{ color: "var(--widget-text)" }}
        >
          Trigger interjection
        </h3>
        <p className="mb-3 text-xs" style={{ color: "var(--widget-text-muted)" }}>
          Close the chat widget first. A peek bubble should appear above the
          launcher after the API responds. Standalone demo also auto-fires one
          after 8s when the chat stays closed.
        </p>
        <div className="flex flex-wrap gap-2">
          {INTERJECTION_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => triggerInterjection(type)}
              className="rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors"
              style={{
                borderColor: "var(--widget-border)",
                color: "var(--widget-text)",
                backgroundColor: "var(--widget-surface)",
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
