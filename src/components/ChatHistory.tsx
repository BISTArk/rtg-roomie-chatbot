"use client";

import { Clock3, MessageCircle, Plus, Trash2, X } from "lucide-react";
import type { SessionHistoryItem } from "@/lib/platform-types";

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: SessionHistoryItem;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group flex w-full cursor-pointer flex-col gap-1 rounded-xl border px-3 py-3 text-left transition-colors ${
        isActive
          ? "border-[var(--widget-accent)]/20 bg-[var(--widget-accent)]/10"
          : "border-transparent hover:bg-[var(--widget-surface-alt)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle
            size={14}
            className={
              isActive ? "shrink-0 text-[var(--widget-accent)]" : "shrink-0 text-[var(--widget-text-muted)]"
            }
          />
          <span
            className={`truncate text-sm font-medium ${
              isActive ? "text-[var(--widget-accent)]" : "text-[var(--widget-text)]"
            }`}
          >
            {session.title || "New Chat"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[11px] text-[var(--widget-text-muted)]">
            {formatDate(session.updatedAt)}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--widget-text-muted)] opacity-0 transition hover:bg-[var(--widget-surface-alt)] hover:text-[var(--widget-text)] group-hover:opacity-100"
            aria-label="Delete chat"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {session.previewText ? (
        <p className="line-clamp-2 pl-[22px] text-xs leading-5 text-[var(--widget-text-muted)]">
          {session.previewText}
        </p>
      ) : null}
    </div>
  );
}

export function ChatHistory({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onNewChat,
  onClose,
}: {
  sessions: SessionHistoryItem[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[var(--widget-surface)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--widget-border)] px-4">
        <div className="flex items-center gap-2">
          <Clock3 size={15} className="text-[var(--widget-text-muted)]" />
          <span className="text-sm font-semibold text-[var(--widget-text)]">
            Chat History
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--widget-text-muted)] transition-colors hover:bg-[var(--widget-surface-alt)] hover:text-[var(--widget-text)]"
          aria-label="Close history"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--widget-border)] px-4 py-3 text-sm font-medium text-[var(--widget-text-muted)] transition-colors hover:border-[var(--widget-accent)] hover:bg-[var(--widget-accent)]/5 hover:text-[var(--widget-accent)]"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageCircle
              size={32}
              className="mb-3 text-[var(--widget-text-muted)] opacity-40"
            />
            <p className="text-sm text-[var(--widget-text-muted)]">
              No chat history yet
            </p>
            <p className="mt-1 text-xs text-[var(--widget-text-muted)] opacity-70">
              Start a new conversation to begin
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {sessions.map((session) => (
              <SessionItem
                key={session.sessionId}
                session={session}
                isActive={session.sessionId === activeSessionId}
                onSelect={() => onSelectSession(session.sessionId)}
                onDelete={() => onDeleteSession(session.sessionId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
