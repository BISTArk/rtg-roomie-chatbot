"use client";

import { useState, useEffect } from "react";
import type { TenantSessionAnalyticsRecord } from "@/lib/platform-types";

interface ChatMessage {
  id: string;
  role: string;
  text: string;
  sort_order: number;
}

interface SessionMessagesModalProps {
  isOpen: boolean;
  session: TenantSessionAnalyticsRecord | null;
  onClose: () => void;
}

export default function SessionMessagesModal({
  isOpen,
  session,
  onClose,
}: SessionMessagesModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !session) {
      setMessages([]);
      setError(null);
      return;
    }

    const fetchMessages = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/session-messages?tenantId=${encodeURIComponent(
            session.tenantId
          )}&sessionId=${encodeURIComponent(session.sessionId)}`
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch messages: ${response.statusText}`);
        }
        const data = await response.json();
        setMessages(data.messages || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load messages");
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [isOpen, session]);

  if (!isOpen || !session) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border bg-white shadow-lg"
        style={{
          borderColor: "var(--widget-border)",
          background: "var(--widget-surface)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{
            borderColor: "var(--widget-border)",
            background: "var(--widget-surface-alt)",
          }}
        >
          <div>
            <h2 className="text-lg font-semibold text-[var(--widget-text)]">
              Chat Messages
            </h2>
            <p className="mt-1 text-sm text-[var(--widget-text-muted)]">
              {session.tenantName} • {session.sessionId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-[var(--widget-surface-alt)] transition-colors text-[var(--widget-text-muted)]"
            aria-label="Close modal"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-[var(--widget-text-muted)]">
                Loading messages...
              </div>
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-[var(--widget-text-muted)]">
                No messages in this session
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg p-4 ${
                    message.role === "user"
                      ? "bg-[var(--widget-primary)]/10 border border-[var(--widget-primary)]/20"
                      : "bg-[var(--widget-surface-alt)] border border-[var(--widget-border)]"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--widget-text-muted)]">
                      {message.role === "user" ? "User" : "Assistant"}
                    </span>
                    <span className="text-xs text-[var(--widget-text-muted)]">
                      #{message.sort_order}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm text-[var(--widget-text)]">
                    {message.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end border-t px-6 py-4"
          style={{ borderColor: "var(--widget-border)" }}
        >
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm font-medium transition-colors"
            style={{
              borderColor: "var(--widget-border)",
              background: "var(--widget-surface)",
              color: "var(--widget-text)",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
