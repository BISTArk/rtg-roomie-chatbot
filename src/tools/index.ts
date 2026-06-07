import { askUserQuestionTool } from "@/tools/ask-user-question";
import { compareTool } from "@/tools/compare-tool";
import { productSearchTool } from "@/tools/product-search";

export const chatTools = {
  product_search: productSearchTool,
  ask_user_question: askUserQuestionTool,
  compare_tool: compareTool,
};
