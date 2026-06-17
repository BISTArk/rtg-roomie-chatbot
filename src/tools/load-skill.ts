import { tool } from "ai";
import { z } from "zod";
import {
  buildLoadSkillToolDescription,
  loadSkillByName,
  type SkillMetadata,
} from "@/lib/skills";
import type { TenantSkillPrompts } from "@/lib/platform-types";

export function createLoadSkillTool(input: {
  skills: SkillMetadata[];
  skillPrompts?: TenantSkillPrompts | null;
}) {
  return tool({
    description: buildLoadSkillToolDescription(input.skills),
    inputSchema: z.object({
      name: z.string().describe("The skill name to load."),
    }),
    execute: async ({ name }) => {
      const result = loadSkillByName({
        name,
        skills: input.skills,
        tenantSkillPrompts: input.skillPrompts,
      });

      if ("error" in result) {
        return { error: result.error };
      }

      return {
        name: result.name,
        content: result.content,
      };
    },
  });
}
