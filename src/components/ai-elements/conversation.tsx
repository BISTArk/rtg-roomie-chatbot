"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import { ArrowDownIcon, DownloadIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from "react";

const SCROLL_BOTTOM_THRESHOLD_PX = 70;

export const ConversationScrollContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

export type ConversationRootProps = ComponentProps<"div">;

/** Positions scroll UI (e.g. scroll-to-bottom) against the viewport, not the message list. */
export const ConversationRoot = ({
  className,
  children,
  ...props
}: ConversationRootProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <ConversationScrollContext.Provider value={scrollRef}>
      <div
        className={cn("relative flex min-h-0 flex-1 flex-col", className)}
        {...props}
      >
        {children}
      </div>
    </ConversationScrollContext.Provider>
  );
};

export type ConversationProps = ComponentProps<"div">;

export const Conversation = ({ className, children, ...props }: ConversationProps) => {
  const scrollRef = useContext(ConversationScrollContext);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const resolvedRef = scrollRef ?? fallbackRef;

  const scrollArea = (
    <div
      ref={resolvedRef}
      className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", className)}
      role="log"
      {...props}
    >
      {children}
    </div>
  );

  if (scrollRef) return scrollArea;

  return (
    <ConversationScrollContext.Provider value={fallbackRef}>
      {scrollArea}
    </ConversationScrollContext.Provider>
  );
};

export type ConversationContentProps = ComponentProps<"div">;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <div className={cn("flex flex-col gap-8 p-4", className)} {...props} />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export function useConversationAutoScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  deps: unknown[],
  options: { enabled?: boolean; behavior?: ScrollBehavior } = {}
) {
  const { enabled = true, behavior = "smooth" } = options;

  useEffect(() => {
    if (!enabled) return;
    const element = scrollRef.current;
    if (!element) return;

    const frame = window.requestAnimationFrame(() => {
      element.scrollTo({
        top: element.scrollHeight,
        behavior,
      });
    });

    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies scroll triggers
  }, deps);
}

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const scrollRef = useContext(ConversationScrollContext);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const element = scrollRef?.current;
    if (!element) return;

    const updateIsAtBottom = () => {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      setIsAtBottom(distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD_PX);
    };

    updateIsAtBottom();
    element.addEventListener("scroll", updateIsAtBottom, { passive: true });

    const resizeObserver = new ResizeObserver(updateIsAtBottom);
    resizeObserver.observe(element);
    if (element.firstElementChild) {
      resizeObserver.observe(element.firstElementChild);
    }

    return () => {
      element.removeEventListener("scroll", updateIsAtBottom);
      resizeObserver.disconnect();
    };
  }, [scrollRef]);

  const handleScrollToBottom = useCallback(() => {
    scrollRef?.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [scrollRef]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "pointer-events-auto absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-sm dark:bg-background dark:hover:bg-muted",
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};

const getMessageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  messages: UIMessage[];
  filename?: string;
  formatMessage?: (message: UIMessage, index: number) => string;
};

const defaultFormatMessage = (message: UIMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${getMessageText(message)}`;
};

export const messagesToMarkdown = (
  messages: UIMessage[],
  formatMessage: (
    message: UIMessage,
    index: number
  ) => string = defaultFormatMessage
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

export const ConversationDownload = ({
  messages,
  filename = "conversation.md",
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        "absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted",
        className
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadIcon className="size-4" />}
    </Button>
  );
};
