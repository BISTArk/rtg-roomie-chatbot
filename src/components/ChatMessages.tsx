"use client";

import type { UIMessage } from "ai";
import React, { type RefObject, useMemo, useState } from "react";
import { ArrowRightLeft, Check, ShoppingCart } from "lucide-react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { InlineHTML } from "./InlineHTML";
import { WidgetAvatar } from "./WidgetAvatar";
import { stripStageTag } from "@/lib/stage-tag";
import type { WidgetBranding, WidgetTheme } from "@/lib/widget-config";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div
        className="flex items-center gap-1 rounded-2xl rounded-bl-sm px-4 py-3"
        style={{
          backgroundColor: "var(--widget-surface)",
          border: "1px solid var(--widget-border)",
        }}
      >
        <div className="typing-dot h-2 w-2 rounded-full" />
        <div className="typing-dot h-2 w-2 rounded-full" />
        <div className="typing-dot h-2 w-2 rounded-full" />
      </div>
    </div>
  );
}

interface Segment {
  type: "text" | "html";
  content: string;
}

type AskQuestion = {
  header?: string;
  question?: string;
  multiSelect?: boolean;
  options?: Array<{ label?: string; description?: string }>;
};

type ProductCard = {
  title?: string;
  category?: string;
  brand?: string;
  size?: string;
  salePrice?: string;
  regularPrice?: string;
  image?: string;
  link?: string;
  sku?: string;
  summary?: string;
};

type CompareToolRow = {
  label?: string;
  values?: string[];
};

type CompareRecommendation = {
  label?: string;
  reason?: string;
  productTitle?: string;
  productSku?: string;
  link?: string;
};

function isProductCardHtml(html: string): boolean {
  return /class=["'][^"']*\bcard\b/.test(html);
}

function isPillOnlyHtml(html: string): boolean {
  const hasCard = /class=["'][^"']*\bcard\b/.test(html);
  const hasPill = /class=["'][^"']*\bpill\b/.test(html);
  return hasPill && !hasCard;
}

function cleanTextSegment(text: string): string {
  return text
    .replace(/^\s*What would you like to do\?\s*$/gim, "")
    .trim();
}

function parseSegments(rawText: string): Segment[] {
  const text = stripStageTag(rawText);
  const segments: Segment[] = [];
  const htmlBlockRegex = /```html\s*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = htmlBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = cleanTextSegment(text.slice(lastIndex, match.index));
      if (before) segments.push({ type: "text", content: before });
    }
    segments.push({ type: "html", content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    let remaining = text.slice(lastIndex);
    const incompleteStart = remaining.indexOf("```html");
    if (incompleteStart !== -1) {
      remaining = remaining.slice(0, incompleteStart);
    }
    const cleaned = cleanTextSegment(remaining.trim());
    if (cleaned) segments.push({ type: "text", content: cleaned });
  }

  if (segments.length === 0 && !text.includes("```html")) {
    const cleaned = cleanTextSegment(text);
    if (cleaned) segments.push({ type: "text", content: cleaned });
  }

  return segments;
}

function getTextPart(part: UIMessage["parts"][number]) {
  return part.type === "text" ? part.text : "";
}

function getToolOutput(part: UIMessage["parts"][number]) {
  const candidate = part as unknown as { state?: string; output?: unknown };
  return candidate.state === "output-available" ? candidate.output : null;
}

function getToolInput(part: UIMessage["parts"][number]) {
  const candidate = part as unknown as { state?: string; input?: unknown };
  return candidate.state === "input-available" || candidate.state === "output-available"
    ? candidate.input
    : null;
}

function getToolCallId(part: UIMessage["parts"][number]) {
  return (part as unknown as { toolCallId?: string }).toolCallId || "";
}

function getAskQuestionData(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const data = input as {
    intro?: string;
    questions?: AskQuestion[];
  };
  const questions = Array.isArray(data.questions) ? data.questions : [];
  if (!questions.length) return null;
  return {
    intro: data.intro,
    questions,
  };
}

function getSubmittedAnswers(output: unknown) {
  if (!output || typeof output !== "object") return [];
  const answers = (output as { answers?: unknown }).answers;
  return Array.isArray(answers)
    ? answers.map((answer) => {
        if (!answer || typeof answer !== "object") return "";
        return String((answer as { answer?: unknown }).answer || "").trim();
      })
    : [];
}

function AskUserQuestionTool({
  input,
  output,
  toolCallId,
  onSelect,
}: {
  input: unknown;
  output: unknown;
  toolCallId: string;
  onSelect: (selection: {
    toolCallId: string;
    answers: Array<{ header: string; question: string; answer: string }>;
  }) => void;
}) {
  const data = getAskQuestionData(input);
  const askData = data ?? { intro: undefined, questions: [] as AskQuestion[] };
  const submittedAnswers = getSubmittedAnswers(output);
  const [localAnswers, setLocalAnswers] = useState<Record<number, string>>({});
  const [pendingMultiSelectState, setPendingMultiSelectState] = useState<{
    index: number;
    values: string[];
  }>({ index: -1, values: [] });
  const firstUnanswered = askData.questions.findIndex(
    (_, index) => !submittedAnswers[index] && !localAnswers[index]
  );
  const currentIndex =
    firstUnanswered === -1 ? Math.max(0, askData.questions.length - 1) : firstUnanswered;
  const currentQuestion = askData.questions[currentIndex];
  const isMultiSelect = Boolean(currentQuestion?.multiSelect);
  const isComplete =
    submittedAnswers.length >= askData.questions.length ||
    askData.questions.every((_, index) => Boolean(localAnswers[index]));
  const pendingMultiSelect =
    pendingMultiSelectState.index === currentIndex ? pendingMultiSelectState.values : [];

  if (!data) {
    return (
      <div className="my-2 rounded-2xl border border-[var(--widget-border)] bg-[var(--widget-assistant-bubble)] px-4 py-3 text-sm text-[var(--widget-text-muted)]">
        Preparing questions...
      </div>
    );
  }

  function submitAllAnswers(nextAnswers: Record<number, string>) {
    setLocalAnswers(nextAnswers);

    const allAnswered = askData.questions.every((_, index) => Boolean(nextAnswers[index]));
    if (!allAnswered) return;

    onSelect({
      toolCallId,
      answers: askData.questions.map((question, index) => ({
        header: question.header || `Question ${index + 1}`,
        question: question.question || "",
        answer: nextAnswers[index],
      })),
    });
  }

  function answerQuestion(label: string) {
    submitAllAnswers({ ...localAnswers, [currentIndex]: label });
  }

  function toggleMultiSelectOption(label: string) {
    setPendingMultiSelectState((current) => {
      const values = current.index === currentIndex ? current.values : [];
      return {
        index: currentIndex,
        values: values.includes(label)
          ? values.filter((value) => value !== label)
          : [...values, label],
      };
    });
  }

  function confirmMultiSelect() {
    if (!pendingMultiSelect.length) return;
    submitAllAnswers({
      ...localAnswers,
      [currentIndex]: pendingMultiSelect.join(", "),
    });
  }

  return (
    <div className="my-2 w-full rounded-2xl border border-[var(--widget-border)] bg-white px-4 py-4 shadow-sm">
      {!isComplete ? (
        <Progress
          value={Math.max(12, ((currentIndex + 1) / askData.questions.length) * 100)}
          className="mb-4"
        />
      ) : null}

      {askData.intro && currentIndex === 0 ? (
        <p className="mb-4 text-sm leading-6 text-[var(--widget-text-muted)]">
          {askData.intro}
        </p>
      ) : null}

      <div className="space-y-3">
        {askData.questions.map((question, index) => {
          const answer = submittedAnswers[index] || localAnswers[index] || "";
          const isActive = index === currentIndex && !answer && !isComplete;

          return (
            <div
              key={`${question.header}-${index}`}
              className={
                isActive ? "flex flex-col gap-3" : "grid grid-cols-[1fr_auto] items-center gap-3"
              }
            >
              {isActive ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--widget-surface-alt)] text-xs font-bold text-[var(--widget-accent)]">
                      {index + 1}
                    </span>
                    <p className="truncate text-sm font-semibold text-[var(--widget-text-muted)]">
                      {question.header || `Question ${index + 1}`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--widget-surface-alt)] px-3 py-1 text-xs font-semibold text-[var(--widget-accent)]">
                    {index + 1}/{askData.questions.length}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--widget-surface-alt)] text-xs font-bold text-[var(--widget-accent)]">
                      {answer ? <Check size={12} strokeWidth={3} /> : index + 1}
                    </span>
                    <p className="truncate text-sm font-semibold text-[var(--widget-text-muted)]">
                      {question.header || `Question ${index + 1}`}
                    </p>
                  </div>
                  {answer ? (
                    <span className="justify-self-end rounded-full bg-[var(--widget-surface-alt)] px-3 py-1 text-xs font-semibold text-[var(--widget-accent)]">
                      {answer}
                    </span>
                  ) : null}
                </>
              )}

              {isActive ? (
                <p className="text-sm font-semibold text-[var(--widget-text)]">
                  {question.question}
                </p>
              ) : null}

              {isActive ? (
                <div className="flex flex-col gap-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(question.options || []).map((option) => {
                      const label = option.label?.trim() || "";
                      if (!label) return null;
                      const isSelected =
                        isMultiSelect && index === currentIndex
                          ? pendingMultiSelect.includes(label)
                          : false;

                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() =>
                            isMultiSelect && index === currentIndex
                              ? toggleMultiSelectOption(label)
                              : answerQuestion(label)
                          }
                          disabled={!toolCallId}
                          className={cn(
                            "min-h-16 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60",
                            isSelected
                              ? "border-[var(--widget-accent)] bg-[var(--widget-surface-alt)]"
                              : "border-[var(--widget-border)] bg-white hover:bg-[var(--widget-surface-alt)]"
                          )}
                        >
                          <span className="flex items-start gap-2">
                            {isMultiSelect && index === currentIndex ? (
                              <span
                                className={cn(
                                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                                  isSelected
                                    ? "border-[var(--widget-accent)] bg-[var(--widget-accent)] text-white"
                                    : "border-[var(--widget-border)] bg-white text-transparent"
                                )}
                              >
                                <Check size={10} strokeWidth={3} />
                              </span>
                            ) : null}
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-[var(--widget-text)]">
                                {label}
                              </span>
                              {option.description ? (
                                <span className="mt-1 block text-xs leading-5 text-[var(--widget-text-muted)]">
                                  {option.description}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {isMultiSelect && index === currentIndex ? (
                    <Button
                      type="button"
                      onClick={confirmMultiSelect}
                      disabled={!toolCallId || pendingMultiSelect.length === 0}
                      className="self-end"
                    >
                      Continue
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompareToolCard({ output }: { output: unknown }) {
  if (!output || typeof output !== "object") {
    return (
      <div className="my-2 rounded-2xl border border-[var(--widget-border)] bg-[var(--widget-assistant-bubble)] px-4 py-3 text-sm text-[var(--widget-text-muted)]">
        Comparing selected products...
      </div>
    );
  }

  const data = output as {
    shopperGoal?: string;
    products?: ProductCard[];
    rows?: CompareToolRow[];
    highlights?: {
      cheapestIndex?: number;
      priciestIndex?: number;
    };
    recommendation?: CompareRecommendation | null;
  };

  const products = Array.isArray(data.products) ? data.products : [];
  const rows = Array.isArray(data.rows) ? data.rows : [];

  if (products.length < 2) {
    return null;
  }

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-[var(--widget-border)] bg-white shadow-sm">
      <div className="border-b border-[var(--widget-border)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--widget-text)]">
          <ArrowRightLeft size={16} />
          Product comparison
        </div>
        {data.shopperGoal ? (
          <p className="mt-1.5 text-sm leading-5 text-[var(--widget-text-muted)]">
            {data.shopperGoal}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[796px] border-collapse table-fixed">
          <colgroup>
            <col className="w-[136px]" />
            {products.map((product, index) => (
              <col key={`${product.sku || product.title || index}-col`} className="w-[220px]" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border border-[var(--widget-border)] bg-[var(--widget-surface-alt)] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--widget-text-muted)]">
                Attribute
              </th>
              {products.map((product, index) => (
                <th
                  key={`${product.sku || product.title || index}-header`}
                  className="border border-[var(--widget-border)] bg-[var(--widget-surface)] px-3 py-3.5 text-center align-top text-[var(--widget-text)]"
                >
                  {product.image ? (
                    <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-[var(--widget-border)] bg-[var(--widget-surface)] p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={product.image}
                        alt={product.title || "Product"}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="mx-auto mb-3 h-16 w-16 rounded-lg border border-[var(--widget-border)] bg-[var(--widget-surface-alt)]" />
                  )}
                  <div className="line-clamp-3 text-[13px] font-semibold leading-5">
                    {product.title || "Catalog product"}
                  </div>
                  <div className="mt-1.5 text-[11px] leading-4 text-[var(--widget-text-muted)]">
                    {[product.brand, product.size, product.category].filter(Boolean).join(" | ")}
                  </div>
                  {typeof data.highlights?.cheapestIndex === "number" &&
                  data.highlights.cheapestIndex === index ? (
                    <span className="mt-2 inline-flex rounded-full bg-[var(--widget-surface-alt)] px-2 py-0.5 text-[10px] font-semibold text-[var(--widget-text)]">
                      Best price
                    </span>
                  ) : null}
                  {typeof data.highlights?.priciestIndex === "number" &&
                  data.highlights.priciestIndex === index ? (
                    <span className="mt-2 inline-flex rounded-full bg-[var(--widget-surface-alt)] px-2 py-0.5 text-[10px] font-semibold text-[var(--widget-text)]">
                      Premium pick
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${row.label || rowIndex}`}>
                <th className="border border-[var(--widget-border)] bg-[var(--widget-surface)] px-3 py-2.5 text-left text-[13px] font-semibold text-[var(--widget-text)]">
                  {row.label || "Attribute"}
                </th>
                {products.map((product, productIndex) => (
                  <td
                    key={`${product.sku || product.title || productIndex}-${row.label || rowIndex}`}
                    className={cn(
                      "border border-[var(--widget-border)] bg-[var(--widget-surface)] px-3 py-2.5 text-[13px] leading-5 align-top",
                      row.label === "Price"
                        ? "font-bold text-[var(--widget-accent)]"
                        : row.label === "Availability"
                          ? "font-medium text-[var(--widget-text)]"
                          : "text-[var(--widget-text-muted)]"
                    )}
                  >
                    {row.label === "Availability" ? (
                      <span
                        className={cn(
                          "inline-flex rounded-full bg-[var(--widget-surface-alt)] px-2 py-0.5 text-[10px] font-semibold",
                          row.values?.[productIndex] === "In Stock"
                            ? "text-[var(--widget-text)]"
                            : "text-[var(--widget-text-muted)]"
                        )}
                      >
                        {row.values?.[productIndex] || "—"}
                      </span>
                    ) : (
                      row.values?.[productIndex] || "—"
                    )}
                  </td>
                ))}
              </tr>
            ))}

            <tr>
              <th className="border border-[var(--widget-border)] bg-[var(--widget-surface)] px-3 py-3 text-left text-[13px] font-semibold text-[var(--widget-text)]">
                Actions
              </th>
              {products.map((product, index) => (
                <td
                  key={`${product.sku || product.title || index}-actions`}
                  className="border border-[var(--widget-border)] bg-[var(--widget-surface)] px-3 py-3 align-top"
                >
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={!product.link}
                    onClick={() =>
                      product.link
                        ? window.open(product.link, "_blank", "noopener,noreferrer")
                        : undefined
                    }
                    className="w-full"
                  >
                    <ShoppingCart size={16} />
                    Add to Cart
                  </Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {data.recommendation?.reason ? (
        <div className="border-t border-[var(--widget-border)] bg-[var(--widget-surface-alt)] px-4 py-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[var(--widget-accent)]">
                {data.recommendation.label || "Our Recommendation"}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!data.recommendation.link}
                onClick={() =>
                  data.recommendation?.link
                    ? window.open(data.recommendation.link, "_blank", "noopener,noreferrer")
                    : undefined
                }
                className="shrink-0"
              >
                <ShoppingCart size={16} />
                Add to Cart
              </Button>
            </div>
            {data.recommendation.productTitle ? (
              <div className="text-sm font-medium leading-5 text-[var(--widget-text)]">
                {data.recommendation.productTitle}
              </div>
            ) : null}
            <p className="text-sm leading-6 text-[var(--widget-text-muted)]">
              {data.recommendation.reason}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  isLastAssistant,
  isStreaming,
  lastAssistantRef,
  branding,
  theme,
  onToolOptionSelect,
}: {
  message: UIMessage;
  isLastAssistant: boolean;
  isStreaming: boolean;
  lastAssistantRef?: React.RefObject<HTMLDivElement | null>;
  branding: WidgetBranding;
  theme: WidgetTheme;
  onToolOptionSelect: (selection: {
    toolCallId: string;
    answers: Array<{ header: string; question: string; answer: string }>;
  }) => void;
}) {
  const isUser = message.role === "user";
  const text = message.parts.map(getTextPart).join("");
  const questionToolParts = message.parts.filter(
    (part) => part.type === "tool-ask_user_question"
  );
  const compareToolParts = message.parts.filter(
    (part) => part.type === "tool-compare_tool"
  );

  return (
    <div
      ref={!isUser && isLastAssistant ? lastAssistantRef : undefined}
      className={`chat-bubble-enter flex flex-col ${isUser ? "items-end" : "items-start"} px-4 py-1.5`}
      style={!isUser && isLastAssistant ? { scrollMarginTop: "12vh" } : undefined}
    >
      {!isUser && (
        <div className="mb-1 flex items-center gap-2 pl-1">
          <WidgetAvatar size={24} branding={branding} theme={theme} />
          <span
            className="text-[12px] font-bold"
            style={{ color: "var(--widget-accent)" }}
          >
            {branding.assistantName}
          </span>
        </div>
      )}
      {isUser ? (
        <div
          className="max-w-[88%] rounded-2xl rounded-br-sm px-4 py-2.5 text-[15px] leading-relaxed"
          style={{
            backgroundColor: "var(--widget-user-bubble)",
            color: "var(--widget-text)",
          }}
        >
          {text}
        </div>
      ) : (
        <div className="flex w-full max-w-full flex-col gap-2">
          {questionToolParts.map((part, index) => (
            <AskUserQuestionTool
              key={`${message.id}-ask-${index}`}
              input={getToolInput(part)}
              output={getToolOutput(part)}
              toolCallId={getToolCallId(part)}
              onSelect={onToolOptionSelect}
            />
          ))}
          {compareToolParts.map((part, index) => (
            <CompareToolCard
              key={`${message.id}-compare-${index}`}
              output={getToolOutput(part)}
            />
          ))}
          <FormattedMessage
            text={text}
            messageId={message.id}
            isStreaming={isLastAssistant && isStreaming}
            theme={theme}
          />
        </div>
      )}
    </div>
  );
}

function FormattedMessage({
  text,
  messageId,
  isStreaming,
  theme,
}: {
  text: string;
  messageId: string;
  isStreaming: boolean;
  theme: WidgetTheme;
}) {
  const segments = useMemo(() => parseSegments(text), [text]);
  const content: React.ReactNode[] = [];

  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];

    if (seg.type === "html" && isProductCardHtml(seg.content)) {
      const cardSegments = [seg];

      while (
        idx + 1 < segments.length &&
        segments[idx + 1].type === "html" &&
        isProductCardHtml(segments[idx + 1].content)
      ) {
        cardSegments.push(segments[idx + 1]);
        idx++;
      }

      content.push(
        <div
          key={`${messageId}-cards-${idx}`}
          className="my-1 flex w-full flex-col gap-3"
        >
          {cardSegments.map((cardSeg, cardIdx) => (
            <div
              key={`${messageId}-html-${idx}-${cardIdx}`}
              className="w-full min-w-0"
            >
              <InlineHTML
                html={cardSeg.content}
                id={`${messageId}-${idx}-${cardIdx}`}
                theme={theme}
              />
            </div>
          ))}
        </div>
      );
      continue;
    }

    if (seg.type === "html") {
      const isPillRow = isPillOnlyHtml(seg.content);

      content.push(
        <div
          key={`${messageId}-html-shell-${idx}`}
          className={isPillRow ? "" : "px-1 py-1"}
        >
          <InlineHTML
            key={`${messageId}-html-${idx}`}
            html={seg.content}
            id={`${messageId}-${idx}`}
            theme={theme}
          />
        </div>
      );
      continue;
    }

    content.push(
      <div
        key={`${messageId}-text-${idx}`}
        className="streamdown-content rounded-2xl px-4 py-3"
        style={{
          border: "1px solid var(--widget-border)",
          backgroundColor: "var(--widget-assistant-bubble)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <Streamdown
          mode={isStreaming ? "streaming" : "static"}
          parseIncompleteMarkdown={isStreaming}
          linkSafety={{ enabled: false }}
          components={{
            a: ({ href, children, ...rest }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--widget-accent)", textDecoration: "underline" }}
                {...rest}
              >
                {children}
              </a>
            ),
          }}
        >
          {seg.content}
        </Streamdown>
      </div>
    );
  }

  return <>{content}</>;
}

export function ChatMessages({
  messages,
  isStreaming,
  messagesEndRef,
  lastAssistantRef,
  scrollContainerRef,
  branding,
  theme,
  onToolOptionSelect,
}: {
  messages: UIMessage[];
  isStreaming: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  lastAssistantRef?: RefObject<HTMLDivElement | null>;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  branding: WidgetBranding;
  theme: WidgetTheme;
  onToolOptionSelect: (selection: {
    toolCallId: string;
    answers: Array<{ header: string; question: string; answer: string }>;
  }) => void;
}) {
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }

  return (
    <div
      ref={scrollContainerRef}
      className="chat-messages flex-1 overflow-y-auto py-3"
      style={{
        backgroundColor: "var(--widget-surface-alt)",
        overscrollBehavior: "contain",
      }}
    >
      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isLastAssistant={i === lastAssistantIdx}
          isStreaming={isStreaming}
          lastAssistantRef={lastAssistantRef}
          branding={branding}
          theme={theme}
          onToolOptionSelect={onToolOptionSelect}
        />
      ))}
      {isStreaming && messages[messages.length - 1]?.role === "user" && (
        <TypingIndicator />
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
