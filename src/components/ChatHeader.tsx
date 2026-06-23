"use client";

import { Clock3, Heart, MessageCircle, Minus, RefreshCw } from "lucide-react";
import type { WidgetBranding, WidgetTheme } from "@/lib/widget-config";

export function ChatHeader({
  onMinimize,
  onRefresh,
  onToggleHistory,
  isHistoryOpen,
  onToggleFavourites,
  isFavouritesOpen,
  favouriteCount,
  onContinueWhatsApp,
  showWhatsAppButton,
  branding,
}: {
  onMinimize: () => void;
  onRefresh: () => void;
  onToggleHistory: () => void;
  isHistoryOpen: boolean;
  onToggleFavourites: () => void;
  isFavouritesOpen: boolean;
  favouriteCount: number;
  onContinueWhatsApp?: () => void;
  showWhatsAppButton?: boolean;
  branding: WidgetBranding;
  theme: WidgetTheme;
}) {
  const iconBaseStyle = {
    color: "var(--widget-primary-text)",
    backgroundColor: "transparent",
  } as const;

  const hoverBg = "color-mix(in srgb, var(--widget-primary-text) 16%, transparent)";
  const activeBg = "color-mix(in srgb, var(--widget-primary-text) 24%, transparent)";

  return (
    <div
      className="flex min-h-16 shrink-0 items-center justify-between border-b px-4 py-3"
      style={{
        backgroundColor: "var(--widget-primary)",
        borderColor: "var(--widget-primary)",
        color: "var(--widget-primary-text)",
      }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-semibold leading-tight">
          {branding.headerTitle}
        </span>
        <span
          className="text-xs leading-tight opacity-80"
          style={{ color: "var(--widget-primary-text)" }}
        >
          {branding.headerSubtitle}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {showWhatsAppButton && onContinueWhatsApp ? (
          <button
            onClick={onContinueWhatsApp}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            style={iconBaseStyle}
            aria-label={branding.whatsappButtonLabel}
            title={branding.whatsappButtonLabel}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = hoverBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <MessageCircle size={16} />
          </button>
        ) : null}
        <button
          onClick={onRefresh}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={iconBaseStyle}
          aria-label="New conversation"
          title="New conversation"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = hoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={onToggleFavourites}
          className={`relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--widget-danger)] transition-colors ${
            isFavouritesOpen ? "" : ""
          }`}
          style={{
            ...iconBaseStyle,
            backgroundColor: isFavouritesOpen ? activeBg : "transparent",
          }}
          aria-label="Favourites"
          title="Favourites"
          onMouseEnter={(e) => {
            if (isFavouritesOpen) return;
            e.currentTarget.style.backgroundColor = hoverBg;
          }}
          onMouseLeave={(e) => {
            if (isFavouritesOpen) return;
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Heart size={16} className="fill-[var(--widget-danger)]" />
          {favouriteCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--widget-danger)] px-1 text-[10px] font-semibold text-white">
              {favouriteCount > 9 ? "9+" : favouriteCount}
            </span>
          ) : null}
        </button>
        <button
          onClick={onToggleHistory}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{
            ...iconBaseStyle,
            backgroundColor: isHistoryOpen ? activeBg : "transparent",
          }}
          aria-label="Chat history"
          title="Chat history"
          onMouseEnter={(e) => {
            if (isHistoryOpen) return;
            e.currentTarget.style.backgroundColor = hoverBg;
          }}
          onMouseLeave={(e) => {
            if (isHistoryOpen) return;
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Clock3 size={16} />
        </button>
        <button
          onClick={onMinimize}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={iconBaseStyle}
          aria-label={`Minimize ${branding.headerTitle}`}
          title="Minimize chat"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = hoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Minus size={18} />
        </button>
      </div>
    </div>
  );
}
