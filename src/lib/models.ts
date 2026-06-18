export const MAIN_CHAT_MODEL_KEY = "gemini-flash-3";
export const MAIN_CHAT_MODEL_ID = "google/gemini-3-flash-preview";

export const CATALOG_AGENT_MODEL_ID = "google/gemini-3.1-flash-lite";

export const MODEL_MAP: Record<string, string> = {
  [MAIN_CHAT_MODEL_KEY]: MAIN_CHAT_MODEL_ID,
  "gpt-5.4-mini": "openai/gpt-5.4-mini",
  "gemini-2.5-flash": "google/gemini-2.5-flash",
  "gemini-3.1-flash-lite": CATALOG_AGENT_MODEL_ID,
  "claude-sonnet-4.6": "anthropic/claude-sonnet-4.6",
  "gpt-5.4": "openai/gpt-5.4",
};

export const DEFAULT_MODEL = MAIN_CHAT_MODEL_KEY;
