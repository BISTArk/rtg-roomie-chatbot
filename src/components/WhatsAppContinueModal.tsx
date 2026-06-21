"use client";

import { useState } from "react";
import type { WidgetBranding } from "@/lib/widget-config";

export function WhatsAppContinueModal({
  open,
  branding,
  isSubmitting,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  branding: WidgetBranding;
  isSubmitting: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: { phone: string; consent: boolean }) => void;
}) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--widget-overlay)] p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl border p-5 shadow-xl"
        style={{
          borderColor: "var(--widget-border)",
          backgroundColor: "var(--widget-surface)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              className="text-base font-semibold"
              style={{ color: "var(--widget-text)" }}
            >
              {branding.whatsappButtonLabel}
            </h3>
            <p className="mt-1 text-sm" style={{ color: "var(--widget-text-muted)" }}>
              Enter your phone number and we&apos;ll send your conversation to WhatsApp so you can
              keep shopping there.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full px-2 py-1 text-sm"
            style={{ color: "var(--widget-text-muted)" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium" style={{ color: "var(--widget-text)" }}>
            Phone number
          </label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+1 555 123 4567"
            disabled={isSubmitting}
            className="w-full rounded-xl border px-4 py-2.5 text-[15px]"
            style={{
              borderColor: "var(--widget-border)",
              backgroundColor: "var(--widget-surface-alt)",
              color: "var(--widget-text)",
            }}
          />

          <label className="flex items-start gap-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={isSubmitting}
              className="mt-0.5"
            />
            <span>{branding.whatsappConsentText}</span>
          </label>

          {error ? (
            <p className="text-sm" style={{ color: "var(--widget-danger)" }}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium"
            style={{
              borderColor: "var(--widget-border)",
              color: "var(--widget-text)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting || !phone.trim() || !consent}
            onClick={() => onSubmit({ phone: phone.trim(), consent })}
            className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-50"
            style={{
              backgroundColor: "var(--widget-accent)",
              color: "var(--widget-accent-text)",
            }}
          >
            {isSubmitting ? "Sending..." : "Send to WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}
