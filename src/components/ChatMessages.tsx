"use client";

import type { UIMessage } from "ai";
import React, { useContext, useState } from "react";
import { ArrowRightLeft, BarChart3, Check, Heart, ShoppingCart } from "lucide-react";
import "streamdown/styles.css";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationRoot,
  ConversationScrollButton,
  ConversationScrollContext,
  useConversationAutoScroll,
} from "@/components/ai-elements/conversation";

import { hasUserEngaged, isProactiveBudgetExhausted } from "@/lib/pre-engagement";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { WidgetAvatar } from "./WidgetAvatar";
import { chatQuickSuggestions } from "@/lib/chat-suggestions";
import {
  isInterjectionMessage,
  isNewSessionMessage,
  shouldMergeAssistantMessages,
  splitTransientAssistantMessages,
} from "@/lib/interjection";
import { stripStageTag } from "@/lib/stage-tag";
import type { WidgetBranding, WidgetTheme } from "@/lib/widget-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addProductToCart, formatProductPrice, openProductLink } from "@/lib/product-actions";
import type {
  ProductCard,
  SelectableProductCard,
} from "@/lib/product-types";
import { cn } from "@/lib/utils";

function ToolStatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <Card className="my-1 rounded-2xl border-[var(--widget-border)] bg-[var(--widget-assistant-bubble)] py-0 shadow-none">
      <CardContent className="px-4 py-3 text-sm text-[var(--widget-text-muted)]">
        {children}
      </CardContent>
    </Card>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <Card className="rounded-2xl rounded-bl-sm border-[var(--widget-border)] py-0 shadow-none">
        <CardContent className="flex items-center gap-1.5 px-4 py-3">
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="size-2 rounded-full" />
        </CardContent>
      </Card>
    </div>
  );
}

const suggestionButtonClassName =
  "h-auto min-h-8 whitespace-normal rounded-full px-4 py-2 text-sm";

function QuickSuggestions({
  suggestions,
  onSelect,
  disabled,
}: {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex w-full flex-wrap justify-center gap-2.5">
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={suggestionButtonClassName}
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}

function NextQuestionSuggestions({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}) {
  const validSuggestions = suggestions
    .map((suggestion) => String(suggestion || "").trim())
    .filter(Boolean);

  if (!validSuggestions.length) return null;

  return (
    <div className="flex flex-wrap gap-2 py-1">
      {validSuggestions.map((suggestion) => (
        <Button
          key={suggestion}
          type="button"
          variant="outline"
          size="sm"
          className={cn(suggestionButtonClassName, "text-left")}
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}

type AskQuestion = {
  header?: string;
  question?: string;
  multiSelect?: boolean;
  options?: Array<{ label?: string; description?: string }>;
};

type CompareToolRow = {
  label?: string;
  values?: string[];
};

type CompareRecommendation = {
  reason?: string;
  productTitle?: string;
  productSku?: string;
  link?: string;
};

function cleanTextSegment(text: string): string {
  return text
    .replace(/```html[\s\S]*?```/gi, "")
    .replace(/<div[^>]*class="[^"]*flex-wrap[^"]*"[\s\S]*?<\/div>/gi, "")
    .replace(/^\s*What would you like to do\?\s*$/gim, "")
    .trim();
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
  return candidate.state === "input-streaming" || candidate.state === "input-available" || candidate.state === "output-available"
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
    return <ToolStatusMessage>Preparing questions...</ToolStatusMessage>;
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
    <Card className="my-0 w-full rounded-2xl py-0 shadow-sm">
      <CardContent className={cn("px-4", isComplete ? "py-2.5" : "py-3")}>
        {!isComplete ? (
          <Progress
            value={Math.max(12, ((currentIndex + 1) / askData.questions.length) * 100)}
            className="mb-4"
          />
        ) : null}

        {askData.intro && currentIndex === 0 ? (
          <CardDescription className="mb-4 text-sm leading-6">
            {askData.intro}
          </CardDescription>
        ) : null}

        <div className="space-y-2">
          {askData.questions.map((question, index) => {
            const answer = submittedAnswers[index] || localAnswers[index] || "";
            const isActive = index === currentIndex && !answer && !isComplete;

            return (
              <div
                key={`${question.header}-${index}`}
                className={
                  isActive
                    ? "flex flex-col gap-3"
                    : "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                }
              >
                {isActive ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="size-5 shrink-0 justify-center rounded-full p-0 text-xs font-bold"
                      >
                        {index + 1}
                      </Badge>
                      <p className="truncate text-sm font-semibold text-muted-foreground">
                        {question.header || `Question ${index + 1}`}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 px-3 py-1 text-xs font-semibold">
                      {index + 1}/{askData.questions.length}
                    </Badge>
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="size-5 shrink-0 justify-center rounded-full p-0 text-xs font-bold"
                      >
                        {answer ? <Check size={12} strokeWidth={3} /> : index + 1}
                      </Badge>
                      <p className="truncate text-sm font-semibold text-muted-foreground">
                        {question.header || `Question ${index + 1}`}
                      </p>
                    </div>
                    {answer ? (
                      <Badge
                        variant="outline"
                        className="h-auto shrink-0 justify-self-end whitespace-normal px-3 py-1 text-xs font-semibold leading-5"
                      >
                        {answer}
                      </Badge>
                    ) : null}
                  </>
                )}

                {isActive ? (
                  <CardTitle className="text-sm font-semibold">
                    {question.question}
                  </CardTitle>
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
                          <Button
                            key={label}
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            onClick={() =>
                              isMultiSelect && index === currentIndex
                                ? toggleMultiSelectOption(label)
                                : answerQuestion(label)
                            }
                            disabled={!toolCallId}
                            className="h-auto min-h-16 w-full justify-start whitespace-normal rounded-xl px-4 py-3 text-left"
                          >
                            <span className="flex items-start gap-2">
                              {isMultiSelect && index === currentIndex ? (
                                <span
                                  className={cn(
                                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                                    isSelected
                                      ? "border-[var(--widget-primary)] bg-[var(--widget-primary)] text-[var(--widget-primary-text)]"
                                      : "border-[var(--widget-border)] bg-[var(--widget-surface)] text-transparent"
                                  )}
                                >
                                  <Check size={10} strokeWidth={3} />
                                </span>
                              ) : null}
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold">{label}</span>
                                {option.description ? (
                                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                    {option.description}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </Button>
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
      </CardContent>
    </Card>
  );
}

function ProductSearchTool({
  output,
  selectedProductKeys,
  favouriteProductKeys,
  onToggleCompareSelection,
  onToggleFavourite,
}: {
  output: unknown;
  selectedProductKeys: string[];
  favouriteProductKeys: string[];
  onToggleCompareSelection: (product: SelectableProductCard) => void;
  onToggleFavourite: (product: SelectableProductCard) => void;
}) {
  if (!output || typeof output !== "object") {
    return <ToolStatusMessage>Searching catalog...</ToolStatusMessage>;
  }

  const data = output as {
    products?: ProductCard[];
  };
  const products = Array.isArray(data.products) ? data.products : [];

  if (!products.length) {
    return <ToolStatusMessage>No matching catalog products found.</ToolStatusMessage>;
  }

  return (
    <div className="my-0 space-y-2">
      {products.map((product, index) => {
        const productKey = product.sku || product.title || `${index}`;
        const isSelected = selectedProductKeys.includes(productKey);
        const isFavourited = favouriteProductKeys.includes(productKey);
        const price = formatProductPrice(product);

        return (
          <Card
            key={`${productKey}-${index}`}
            className="overflow-hidden rounded-2xl py-0 shadow-none"
          >
            <CardContent className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 p-4">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-[var(--widget-surface-alt)]">
                {product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image}
                    alt={product.title || "Product"}
                    className="h-full w-full rounded-xl object-contain"
                    loading="lazy"
                  />
                ) : (
                  <Skeleton className="h-full w-full rounded-xl" />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    isFavourited ? "Remove from favourites" : "Add to favourites"
                  }
                  onClick={() =>
                    onToggleFavourite({
                      ...product,
                      productKey,
                    })
                  }
                  className={cn(
                    "absolute -right-3 -top-3 rounded-full border border-[var(--widget-border)] bg-background shadow-sm",
                    isFavourited
                      ? "text-[var(--widget-danger)] hover:text-[var(--widget-danger)]"
                      : "text-[var(--widget-text)]"
                  )}
                >
                  <Heart
                    size={16}
                    className={
                      isFavourited ? "fill-[var(--widget-danger)]" : undefined
                    }
                  />
                </Button>
              </div>

              <div className="min-w-0">
                <CardTitle className="line-clamp-2 text-sm leading-5">
                  {product.title || "Catalog product"}
                </CardTitle>
                <CardDescription className="mt-1.5 line-clamp-1 text-xs uppercase">
                  {[product.brand, product.size, product.category].filter(Boolean).join(" | ")}
                </CardDescription>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <Badge
                    variant="outline"
                    className="border-0 px-0 text-xl font-bold leading-none text-destructive"
                  >
                    {price}
                  </Badge>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant={isSelected ? "destructive" : "outline"}
                      size="sm"
                      onClick={() =>
                        onToggleCompareSelection({
                          ...product,
                          productKey,
                        })
                      }
                    >
                      {isSelected ? <Check /> : <BarChart3 />}
                      {isSelected ? "Selected" : "Compare"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!product.link}
                      onClick={() => openProductLink(product)}
                    >
                      View Product
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={!product.link && !product.shopifyVariantId}
                      onClick={() => addProductToCart(product)}
                    >
                      <ShoppingCart />
                      Add to Cart
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>

            {product.summary ? (
              <>
                <Separator />
                <CardContent className="px-4 py-2.5">
                  <CardDescription className="text-xs leading-5">
                    <span className="font-semibold text-foreground">Why it fits:</span>{" "}
                    {product.summary}
                  </CardDescription>
                </CardContent>
              </>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function CompareToolCard({ output }: { output: unknown }) {
  if (!output || typeof output !== "object") {
    return <ToolStatusMessage>Comparing selected products...</ToolStatusMessage>;
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
    <div className="flex flex-col gap-3">
      <Card className="my-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ArrowRightLeft size={16} />
            Product comparison
          </CardTitle>
          {data.shopperGoal ? (
            <CardDescription className="mt-1.5 text-sm leading-5">
              {data.shopperGoal}
            </CardDescription>
          ) : null}
        </CardHeader>

        <Table className="min-w-[796px] table-fixed">
        <colgroup>
          <col className="w-[136px]" />
          {products.map((product, index) => (
            <col key={`${product.sku || product.title || index}-col`} className="w-[220px]" />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-muted px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Attribute
            </TableHead>
            {products.map((product, index) => (
              <TableHead
                key={`${product.sku || product.title || index}-header`}
                className="px-3 py-3.5 text-center align-top whitespace-normal"
              >
                {product.image ? (
                  <div className="mx-auto mb-3 flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-card p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.image}
                      alt={product.title || "Product"}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <Skeleton className="mx-auto mb-3 size-16 rounded-lg" />
                )}
                <CardTitle className="line-clamp-3 text-[13px] leading-5">
                  {product.title || "Catalog product"}
                </CardTitle>
                <CardDescription className="mt-1.5 text-[11px] leading-4">
                  {[product.brand, product.size, product.category].filter(Boolean).join(" | ")}
                </CardDescription>
                {typeof data.highlights?.cheapestIndex === "number" &&
                data.highlights.cheapestIndex === index ? (
                  <Badge variant="secondary" className="mt-2 text-[10px]">
                    Best price
                  </Badge>
                ) : null}
                {typeof data.highlights?.priciestIndex === "number" &&
                data.highlights.priciestIndex === index ? (
                  <Badge variant="secondary" className="mt-2 text-[10px]">
                    Premium pick
                  </Badge>
                ) : null}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={`row-${row.label || rowIndex}`}>
              <TableHead className="px-3 py-2.5 text-[13px] font-semibold whitespace-normal">
                {row.label || "Attribute"}
              </TableHead>
              {products.map((product, productIndex) => (
                <TableCell
                  key={`${product.sku || product.title || productIndex}-${row.label || rowIndex}`}
                  className={cn(
                    "px-3 py-2.5 text-[13px] leading-5 align-top whitespace-normal",
                    row.label === "Price" && "font-bold text-destructive",
                    row.label === "Availability" && "font-medium text-foreground"
                  )}
                >
                  {row.label === "Availability" ? (
                    <Badge
                      variant={
                        row.values?.[productIndex] === "In Stock" ? "success" : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {row.values?.[productIndex] || "—"}
                    </Badge>
                  ) : (
                    row.values?.[productIndex] || "—"
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}

          <TableRow>
            <TableHead className="px-3 py-3 text-[13px] font-semibold">Actions</TableHead>
            {products.map((product, index) => (
              <TableCell key={`${product.sku || product.title || index}-actions`} className="px-3 py-3 align-top">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={!product.link && !product.shopifyVariantId}
                  onClick={() => addProductToCart(product)}
                  className="w-full"
                >
                  <ShoppingCart data-icon="inline-start" />
                  Add to Cart
                </Button>
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
        </Table>
      </Card>

      {data.recommendation?.reason ? (
        <Card className="my-0 overflow-hidden bg-accent py-0 shadow-sm">
          <CardContent className="space-y-2 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base text-accent-foreground">
                Our Recommendation
              </CardTitle>
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
              <CardTitle className="text-sm font-medium leading-5 text-accent-foreground">
                {data.recommendation.productTitle}
              </CardTitle>
            ) : null}
            <CardDescription className="text-sm leading-6 text-accent-foreground/80">
              {data.recommendation.reason}
            </CardDescription>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function isRenderableAssistantBubblePart(part: UIMessage["parts"][number]) {
  return (
    (part.type === "text" && part.text.trim().length > 0) ||
    part.type === "tool-product_search" ||
    part.type === "tool-compare_tool"
  );
}

function MessageBubble({
  message,
  isLastAssistant,
  isStreaming,
  branding,
  theme,
  onToolOptionSelect,
  selectedProductKeys,
  favouriteProductKeys,
  onToggleCompareSelection,
  onToggleFavourite,
}: {
  message: UIMessage;
  isLastAssistant: boolean;
  isStreaming: boolean;
  branding: WidgetBranding;
  theme: WidgetTheme;
  onToolOptionSelect: (selection: {
    toolCallId: string;
    answers: Array<{ header: string; question: string; answer: string }>;
  }) => void;
  selectedProductKeys: string[];
  favouriteProductKeys: string[];
  onToggleCompareSelection: (product: SelectableProductCard) => void;
  onToggleFavourite: (product: SelectableProductCard) => void;
}) {
  const isUser = message.role === "user";
  const text = message.parts.map(getTextPart).join("");
  const assistantBlocks: Array<
    | { type: "bubble"; parts: UIMessage["parts"] }
    | { type: "ask"; part: UIMessage["parts"][number]; index: number }
  > = [];

  if (!isUser) {
    let currentParts: UIMessage["parts"] = [];

    for (const [index, part] of message.parts.entries()) {
      if (part.type === "tool-ask_user_question") {
        if (currentParts.some(isRenderableAssistantBubblePart)) {
          assistantBlocks.push({ type: "bubble", parts: currentParts });
        }
        currentParts = [];
        assistantBlocks.push({ type: "ask", part, index });
        continue;
      }

      currentParts.push(part);
    }

    if (currentParts.some(isRenderableAssistantBubblePart)) {
      assistantBlocks.push({ type: "bubble", parts: currentParts });
    }
  }

  return (
    <div className="chat-bubble-enter flex w-full flex-col gap-1.5">
      {!isUser && (
        <div className="flex items-center gap-2 pl-1">
          <WidgetAvatar size={24} branding={branding} theme={theme} />
          <Badge className="text-[12px] font-bold">{branding.assistantName}</Badge>
        </div>
      )}
      {isUser ? (
        <Message from="user" className="max-w-[88%]">
          <MessageContent variant="contained">{text}</MessageContent>
        </Message>
      ) : (
        <div className="flex w-full flex-col gap-1.5">
          {assistantBlocks.map((block, blockIndex) => {
            if (block.type === "ask") {
              return (
                <AskUserQuestionTool
                  key={`${message.id}-ask-${block.index}`}
                  input={getToolInput(block.part)}
                  output={getToolOutput(block.part)}
                  toolCallId={getToolCallId(block.part)}
                  onSelect={onToolOptionSelect}
                />
              );
            }

            return (
              <Message
                key={`${message.id}-bubble-${blockIndex}`}
                from="assistant"
                className="max-w-full gap-1"
              >
                <MessageContent variant="contained">
                  {block.parts.map((part, index) => {
                    if (part.type === "text" && part.text.trim()) {
                      return (
                        <FormattedMessage
                          key={`${message.id}-text-${blockIndex}-${index}`}
                          text={part.text}
                          isStreaming={isLastAssistant && isStreaming}
                        />
                      );
                    }

                    if (part.type === "tool-product_search") {
                      return (
                        <ProductSearchTool
                          key={`${message.id}-products-${blockIndex}-${index}`}
                          output={getToolOutput(part)}
                          selectedProductKeys={selectedProductKeys}
                          favouriteProductKeys={favouriteProductKeys}
                          onToggleCompareSelection={onToggleCompareSelection}
                          onToggleFavourite={onToggleFavourite}
                        />
                      );
                    }

                    if (part.type === "tool-compare_tool") {
                      return (
                        <CompareToolCard
                          key={`${message.id}-compare-${blockIndex}-${index}`}
                          output={getToolOutput(part)}
                        />
                      );
                    }

                    return null;
                  })}
                </MessageContent>
              </Message>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormattedMessage({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const content = cleanTextSegment(stripStageTag(text));
  if (!content) return null;

  return (
    <MessageResponse
      className="streamdown-content text-sm"
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
      {content}
    </MessageResponse>
  );
}

function ConversationAutoScroll({
  messageCount,
  isStreaming,
  hasPendingAssistant,
  suggestionCount,
}: {
  messageCount: number;
  isStreaming: boolean;
  hasPendingAssistant: boolean;
  suggestionCount: number;
}) {
  const scrollRef = useContext(ConversationScrollContext);
  useConversationAutoScroll(
    scrollRef ?? { current: null },
    [messageCount, isStreaming, hasPendingAssistant, suggestionCount],
    { behavior: isStreaming ? "auto" : "smooth" }
  );
  return null;
}

export function ChatMessages({
  messages,
  isStreaming,
  branding,
  theme,
  onToolOptionSelect,
  onSuggestionSelect,
  suggestions,
  selectedProductKeys,
  favouriteProductKeys,
  onToggleCompareSelection,
  onToggleFavourite,
}: {
  messages: UIMessage[];
  isStreaming: boolean;
  branding: WidgetBranding;
  theme: WidgetTheme;
  onToolOptionSelect: (selection: {
    toolCallId: string;
    answers: Array<{ header: string; question: string; answer: string }>;
  }) => void;
  onSuggestionSelect: (suggestion: string) => void;
  suggestions: string[];
  selectedProductKeys: string[];
  favouriteProductKeys: string[];
  onToggleCompareSelection: (product: SelectableProductCard) => void;
  onToggleFavourite: (product: SelectableProductCard) => void;
}) {
  const displayMessages = splitTransientAssistantMessages(
    messages.filter((message) => message.id !== "welcome")
  );
  const groupedMessages = displayMessages.reduce<UIMessage[]>((groups, message) => {
    const previous = groups[groups.length - 1];
    if (previous && shouldMergeAssistantMessages(previous, message)) {
      groups[groups.length - 1] = {
        ...previous,
        id: `${previous.id}-${message.id}`,
        parts: [...previous.parts, ...message.parts],
      };
      return groups;
    }

    groups.push(message);
    return groups;
  }, []);
  const welcomeText =
    messages
      .find((message) => message.id === "welcome")
      ?.parts.map(getTextPart)
      .join("")
      .trim() || `Hi there! I'm ${branding.assistantName}. How can I help?`;
  const hasPendingAssistant =
    isStreaming && groupedMessages[groupedMessages.length - 1]?.role === "user";
  const hasUserMessages = hasUserEngaged(messages);
  const assistantMessageCount = groupedMessages.filter(
    (message) => message.role === "assistant"
  ).length;
  const showGreeting =
    !hasUserMessages &&
    assistantMessageCount === 0 &&
    !isStreaming &&
    !hasPendingAssistant;
  const proactiveBudgetSpent = isProactiveBudgetExhausted(messages);
  const lastGroupedMessage = groupedMessages[groupedMessages.length - 1];
  const showProactiveSuggestions =
    lastGroupedMessage?.role === "assistant" &&
    suggestions.length > 0 &&
    (isInterjectionMessage(lastGroupedMessage) ||
      isNewSessionMessage(lastGroupedMessage));

  return (
    <ConversationRoot
      className="flex-1"
      style={{ backgroundColor: "var(--widget-surface-alt)" }}
    >
      <Conversation
        className="chat-messages"
        style={{ overscrollBehavior: "contain" }}
      >
        <ConversationAutoScroll
          messageCount={groupedMessages.length}
          isStreaming={isStreaming}
          hasPendingAssistant={hasPendingAssistant}
          suggestionCount={suggestions.length}
        />
        <ConversationContent
          className={cn(
            "gap-3 px-4 py-3",
            showGreeting && "min-h-full justify-start pt-14"
          )}
        >
          {showGreeting ? (
            <ConversationEmptyState className="px-6 py-8">
              <Empty className="w-full max-w-xl gap-6 border-0 p-0">
                <EmptyHeader className="w-full max-w-xl">
                  <EmptyTitle className="w-full text-[20px] leading-[1.35] font-semibold text-pretty">
                    {welcomeText}
                  </EmptyTitle>
                </EmptyHeader>
                <EmptyContent className="w-full max-w-xl gap-3">
                  <QuickSuggestions
                    suggestions={chatQuickSuggestions}
                    onSelect={onSuggestionSelect}
                    disabled={isStreaming}
                  />
                </EmptyContent>
              </Empty>
            </ConversationEmptyState>
          ) : (
            <>
              {groupedMessages.map((msg, index) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isLastAssistant={
                    msg.role === "assistant" && index === groupedMessages.length - 1
                  }
                  isStreaming={isStreaming}
                  branding={branding}
                  theme={theme}
                  onToolOptionSelect={onToolOptionSelect}
                  selectedProductKeys={selectedProductKeys}
                  favouriteProductKeys={favouriteProductKeys}
                  onToggleCompareSelection={onToggleCompareSelection}
                  onToggleFavourite={onToggleFavourite}
                />
              ))}
              {!isStreaming &&
              suggestions.length > 0 &&
              (!proactiveBudgetSpent || showProactiveSuggestions) ? (
                <NextQuestionSuggestions
                  suggestions={suggestions}
                  onSelect={onSuggestionSelect}
                />
              ) : null}
            </>
          )}
          {hasPendingAssistant ? <TypingIndicator /> : null}
        </ConversationContent>
      </Conversation>
      <ConversationScrollButton className="bottom-3" />
    </ConversationRoot>
  );
}
