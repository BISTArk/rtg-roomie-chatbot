import { tool } from "ai";
import { z } from "zod";

export const askUserQuestionTool = tool({
  description:
    "Ask the shopper structured guided-selling questions. Use this when multiple-choice answers will narrow the recommendation. Put the full step-by-step questionnaire in this single tool call.",
  inputSchema: z.object({
    intro: z
      .string()
      .optional()
      .describe("Short sentence shown above the questions."),
    questions: z
      .array(
        z.object({
          header: z
            .string()
            .max(24)
            .describe("Short label for the question, like Goal or Preference."),
          question: z.string().describe("The question to ask the shopper."),
          multiSelect: z
            .boolean()
            .optional()
            .default(false)
            .describe("Allow the shopper to pick more than one option."),
          options: z
            .array(
              z.object({
                label: z.string().describe("Short option label."),
                description: z
                  .string()
                  .optional()
                  .describe(
                    "One short sentence explaining what this choice means or when to choose it."
                  ),
              })
            )
            .min(2)
            .max(4),
        })
      )
      .min(1)
      .max(3),
  }),
});
