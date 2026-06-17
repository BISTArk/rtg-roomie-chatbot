import { SKILLS_RAW } from "@/data/skills-raw";
import { SKILLS_REGISTRY } from "@/data/skills-registry";
import type { TenantSkillPrompts } from "@/lib/platform-types";

/**
 * Shop Assist web-app skill registry.
 *
 * Source files live in `skills/<name>/SKILL.md` and are prebaked at build time
 * into `src/data/skills-raw.ts` and `src/data/skills-registry.ts` so the
 * serverless runtime never reads the filesystem. Tenant overrides are loaded
 * from Postgres via `skill_prompts_json`.
 */

export interface SkillMetadata {
  name: string;
  description: string;
}

export interface LoadedSkill {
  name: string;
  content: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FRONTMATTER_STRIP_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(FRONTMATTER_RE);
  if (!match?.[1]) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex <= 0) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_STRIP_RE, "").trim();
}

export function parseSkillFile(content: string): {
  metadata: SkillMetadata;
  body: string;
} {
  const frontmatter = parseFrontmatter(content);
  const body = stripFrontmatter(content);
  const name = frontmatter.name?.trim();
  const description = frontmatter.description?.trim();

  if (!name || !description) {
    throw new Error("Skill file must include frontmatter name and description.");
  }

  return {
    metadata: { name, description },
    body,
  };
}

export function getDefaultSkillRegistry(): SkillMetadata[] {
  return SKILLS_REGISTRY.map(({ name, description }) => ({ name, description }));
}

export function resolveSkillContent(
  name: string,
  tenantSkillPrompts?: TenantSkillPrompts | null
): string | null {
  const normalized = name.trim().toLowerCase();
  const override = tenantSkillPrompts?.[normalized] ?? tenantSkillPrompts?.[name];
  const raw = override?.trim() || SKILLS_RAW[normalized] || SKILLS_RAW[name];
  if (!raw) return null;

  try {
    return stripFrontmatter(raw);
  } catch {
    return raw.trim();
  }
}

export function discoverSkills(
  tenantSkillPrompts?: TenantSkillPrompts | null
): SkillMetadata[] {
  const seen = new Map<string, SkillMetadata>();

  for (const skill of SKILLS_REGISTRY) {
    seen.set(skill.name.toLowerCase(), {
      name: skill.name,
      description: skill.description,
    });
  }

  if (tenantSkillPrompts) {
    for (const [key, content] of Object.entries(tenantSkillPrompts)) {
      const trimmed = content?.trim();
      if (!trimmed) continue;

      try {
        const parsed = parseSkillFile(trimmed);
        seen.set(parsed.metadata.name.toLowerCase(), parsed.metadata);
      } catch {
        const existing = seen.get(key.toLowerCase());
        if (existing) continue;
        seen.set(key.toLowerCase(), {
          name: key,
          description: `Tenant skill override for ${key}.`,
        });
      }
    }
  }

  return [...seen.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

export function buildSkillsPrompt(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return [
      "## Skills",
      "",
      "No specialized skills are currently available.",
    ].join("\n");
  }

  const skillsList = skills
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join("\n");

  return [
    "## Skills",
    "",
    "Use the `load_skill` tool to load a skill when the shopper's request matches a skill description.",
    "Load the full instructions before following specialized workflows. You may load skills again when the conversation shifts.",
    "",
    "Available skills:",
    skillsList,
  ].join("\n");
}

export function buildLoadSkillToolDescription(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return "Load a specialized skill that provides domain-specific instructions and workflows. No skills are currently available.";
  }

  const skillsList = skills
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join("\n");

  return [
    "Load a specialized skill that provides domain-specific instructions and workflows.",
    "",
    "When the shopper's request matches one of the available skills below, call this tool with the skill name to load the full instructions into context.",
    "",
    "Available skills:",
    skillsList,
  ].join("\n");
}

export function loadSkillByName(input: {
  name: string;
  skills: SkillMetadata[];
  tenantSkillPrompts?: TenantSkillPrompts | null;
}): LoadedSkill | { error: string } {
  const normalized = input.name.trim().toLowerCase();
  const skill = input.skills.find(
    (entry) => entry.name.toLowerCase() === normalized
  );

  if (!skill) {
    const available = input.skills.map((entry) => entry.name).join(", ");
    return {
      error: available
        ? `Skill '${input.name}' not found. Available skills: ${available}`
        : `Skill '${input.name}' not found.`,
    };
  }

  const content = resolveSkillContent(skill.name, input.tenantSkillPrompts);
  if (!content) {
    return { error: `Skill '${skill.name}' has no content.` };
  }

  return {
    name: skill.name,
    content,
  };
}
