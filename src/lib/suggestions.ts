import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output, type UIMessage } from "ai";
import { z } from "zod";

const SUGGESTIONS_MODEL = "openai/gpt-5.4-nano";

export async function generateSuggestions(
  messages: UIMessage[]
): Promise<string[]> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || !messages.length) return [];

  const transcript = messages
    .slice(-8)
    .map((message) => {
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
      return `${message.role}: ${text}`;
    })
    .join("\n\n")
    .slice(-12000);

  const result = await generateText({
    model: createOpenRouter({ apiKey }).chat(SUGGESTIONS_MODEL),
    prompt: [
      "Generate 3-5 follow-up actions for this mattress shopper.",
      "Rules: max 40 chars each, start with a verb, no punctuation at end, no full sentences, ultra compact.",
      "Good examples: 'Compare top two', 'Show more Queen options', 'Find under $1500', 'Help with back pain', 'See cooling picks'",
      "Bad examples: 'Would you like me to compare these mattresses?', 'Explore our full selection of sleep products'",
      "",
      transcript,
    ].join("\n"),
    output: Output.object({
      schema: z.object({
        suggestions: z.array(z.string().min(1).max(40)).min(3).max(5),
      }),
    }),
  });

  const suggestions = result.output?.suggestions;
  return Array.isArray(suggestions)
    ? suggestions.map(String).filter(Boolean).slice(0, 5)
    : [];
}
