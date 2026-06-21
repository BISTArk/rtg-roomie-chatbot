"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import type { WidgetBranding } from "@/lib/widget-config";

export function ChatInput({
  onSend,
  disabled,
  isStreaming,
  humanMode,
  whatsappMode,
  onAbort,
  branding,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  isStreaming: boolean;
  humanMode?: boolean;
  whatsappMode?: boolean;
  onAbort: () => void | Promise<void>;
  branding: WidgetBranding;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        borderTop: "1px solid var(--widget-border)",
        backgroundColor: "var(--widget-surface)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {humanMode && (
        <div
          className="px-4 py-2 text-center text-xs font-medium"
          style={{
            backgroundColor: "color-mix(in srgb, var(--widget-surface-alt) 82%, white 18%)",
            color: "var(--widget-accent)",
          }}
        >
          {branding.humanModeBannerText}
        </div>
      )}
      {!humanMode && whatsappMode && (
        <div
          className="px-4 py-2 text-center text-xs font-medium"
          style={{
            backgroundColor: "color-mix(in srgb, var(--widget-success) 12%, white 88%)",
            color: "var(--widget-success)",
          }}
        >
          {branding.whatsappModeBannerText}
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <textarea
          autoFocus
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            humanMode
              ? "Chatting with a human agent..."
              : whatsappMode
                ? "Continue on WhatsApp..."
                : branding.inputPlaceholder
          }
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl px-4 py-2.5 text-[15px] leading-relaxed placeholder:text-gray-400 disabled:opacity-50"
          style={{
            border: "1px solid var(--widget-border)",
            color: "var(--widget-text)",
            backgroundColor: "var(--widget-surface-alt)",
            maxHeight: 100,
            outline: "none",
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = `${Math.min(target.scrollHeight, 100)}px`;
          }}
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onAbort}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
            style={{ backgroundColor: "var(--widget-danger)" }}
            aria-label="Stop generating"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="white"
              aria-hidden
            >
              <rect x="5" y="5" width="14" height="14" rx="1.5" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
            style={{
              backgroundColor:
                disabled || !input.trim()
                  ? "var(--widget-border)"
                  : "var(--widget-accent)",
            }}
            aria-label="Send message"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
