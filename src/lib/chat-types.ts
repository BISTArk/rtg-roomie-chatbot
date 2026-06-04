import type { UIMessage } from "ai";

export interface PersistedChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  parts?: UIMessage["parts"];
}

export interface SharedChatMessage {
  role: "user" | "assistant";
  text: string;
}
