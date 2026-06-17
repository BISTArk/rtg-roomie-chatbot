import type { CatalogDataset, TenantSkillPrompts } from "@/lib/platform-types";
import { discoverSkills, type SkillMetadata } from "@/lib/skills";
import { askUserQuestionTool } from "@/tools/ask-user-question";
import { compareTool } from "@/tools/compare-tool";
import { createLoadSkillTool } from "@/tools/load-skill";
import { createProductSearchTool } from "@/tools/product-search";

export type ChatToolsContext = {
  catalogDataset: CatalogDataset | null;
  skillPrompts?: TenantSkillPrompts | null;
  skills?: SkillMetadata[];
  conversationContext?: string;
  pageContextSummary?: string;
};

export function createChatTools(context: ChatToolsContext) {
  const skills = context.skills ?? discoverSkills(context.skillPrompts);

  return {
    load_skill: createLoadSkillTool({
      skills,
      skillPrompts: context.skillPrompts,
    }),
    product_search: createProductSearchTool({
      catalogDataset: context.catalogDataset,
      conversationContext: context.conversationContext,
      pageContextSummary: context.pageContextSummary,
    }),
    ask_user_question: askUserQuestionTool,
    compare_tool: compareTool,
  } as const;
}
