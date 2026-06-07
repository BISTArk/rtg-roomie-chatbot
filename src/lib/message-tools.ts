import type { UIMessage } from "ai";

type ToolPart = UIMessage["parts"][number] & {
  state?: string;
  toolCallId?: string;
};

function isToolPart(part: UIMessage["parts"][number]): part is ToolPart {
  return typeof part.type === "string" && part.type.startsWith("tool-");
}

function isResolvedToolPart(part: ToolPart): boolean {
  return part.state === "output-available";
}

/** True when the assistant is waiting on an unanswered client-side tool call. */
export function hasPendingToolCalls(messages: UIMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (isToolPart(part) && !isResolvedToolPart(part)) {
        return true;
      }
    }
  }
  return false;
}

/** Drop unresolved tool parts so model history stays valid. */
export function stripUnresolvedToolParts(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((message) => {
      if (message.role !== "assistant") return message;

      const parts = message.parts.filter((part) => {
        if (!isToolPart(part)) return true;
        return isResolvedToolPart(part);
      });

      if (parts.length === message.parts.length) return message;
      if (parts.length === 0) return null;
      return { ...message, parts };
    })
    .filter((message): message is UIMessage => message !== null);
}
