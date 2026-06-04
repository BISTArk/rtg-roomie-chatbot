"use client";

import { useState } from "react";
import { Clock3, Minus, RefreshCw, Share2 } from "lucide-react";
import { WidgetAvatar } from "./WidgetAvatar";
import type { WidgetBranding, WidgetTheme } from "@/lib/widget-config";

export function ChatHeader({
  onMinimize,
  onRefresh,
  onToggleHistory,
  isHistoryOpen,
  onShare,
  branding,
  theme,
}: {
  onMinimize: () => void;
  onRefresh: () => void;
  onToggleHistory: () => void;
  isHistoryOpen: boolean;
  onShare: () => void;
  branding: WidgetBranding;
  theme: WidgetTheme;
}) {
  const [copied, setCopied] = useState(false);

  function handleShare() {
    onShare();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="flex h-14 shrink-0 items-center justify-between border-b px-4"
      style={{
        backgroundColor: "var(--widget-surface)",
        borderColor: "var(--widget-border)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <WidgetAvatar size={32} branding={branding} theme={theme} />
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--widget-text)" }}
        >
          {branding.headerTitle}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={handleShare}
          className="flex h-8 items-center justify-center gap-1 rounded-full px-2 transition-colors"
          style={{ color: "var(--widget-text-muted)" }}
          aria-label="Share chat"
          title="Share chat"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--widget-surface-alt)";
            e.currentTarget.style.color = "var(--widget-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--widget-text-muted)";
          }}
        >
          {copied ? (
            <span className="text-[10px] font-semibold">Copied!</span>
          ) : (
            <Share2 size={15} />
          )}
        </button>

        <button
          onClick={onRefresh}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--widget-text-muted)" }}
          aria-label="New conversation"
          title="New conversation"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--widget-surface-alt)";
            e.currentTarget.style.color = "var(--widget-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--widget-text-muted)";
          }}
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={onToggleHistory}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            isHistoryOpen
              ? "bg-[var(--widget-accent)]/10 text-[var(--widget-accent)]"
              : ""
          }`}
          style={{ color: isHistoryOpen ? undefined : "var(--widget-text-muted)" }}
          aria-label="Chat history"
          title="Chat history"
          onMouseEnter={(e) => {
            if (isHistoryOpen) return;
            e.currentTarget.style.backgroundColor = "var(--widget-surface-alt)";
            e.currentTarget.style.color = "var(--widget-text)";
          }}
          onMouseLeave={(e) => {
            if (isHistoryOpen) return;
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--widget-text-muted)";
          }}
        >
          <Clock3 size={16} />
        </button>
        <button
          onClick={onMinimize}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--widget-text-muted)" }}
          aria-label={`Minimize ${branding.headerTitle}`}
          title="Minimize chat"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--widget-surface-alt)";
            e.currentTarget.style.color = "var(--widget-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--widget-text-muted)";
          }}
        >
          <Minus size={18} />
        </button>
      </div>
    </div>
  );
}
