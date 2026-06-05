export type AssistantPillAction = {
  label: string;
  prompt: string;
};

export type ParsedAssistantMarkup = {
  prose: string;
  actions: AssistantPillAction[];
};

const HTML_FENCE_REGEX = /```html\s*([\s\S]*?)```/gi;
const FLEX_WRAP_REGEX = /<div[^>]*class="[^"]*flex-wrap[^"]*"[\s\S]*?<\/div>/i;
const PILL_BUTTON_REGEX =
  /<button[^>]*onclick="sendPrompt\((['"])((?:\\.|(?!\1).)*)\1\)"[^>]*>([\s\S]*?)<\/button>/gi;

function decodePrompt(value: string): string {
  return value.replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
}

function stripHtmlBlocks(text: string): string {
  return text
    .replace(HTML_FENCE_REGEX, "")
    .replace(FLEX_WRAP_REGEX, "")
    .replace(/```html[\s\S]*$/i, "")
    .replace(/```\s*$/gm, "")
    .trim();
}

function extractPillsFromHtml(html: string): AssistantPillAction[] {
  const actions: AssistantPillAction[] = [];
  let match: RegExpExecArray | null;

  while ((match = PILL_BUTTON_REGEX.exec(html)) !== null) {
    const label = match[3].replace(/<[^>]+>/g, "").trim();
    const prompt = decodePrompt(match[2]);
    if (label && prompt) {
      actions.push({ label, prompt });
    }
  }

  return actions;
}

export function parseAssistantMarkup(text: string): ParsedAssistantMarkup {
  const withoutStageTag = text.replace(/\[STAGE:[^\]]+\]/gi, "").trim();
  const fenceMatch = /```html\s*([\s\S]*?)```/i.exec(withoutStageTag);
  const flexMatch = FLEX_WRAP_REGEX.exec(withoutStageTag);

  let actions: AssistantPillAction[] = [];
  if (fenceMatch) {
    actions = extractPillsFromHtml(fenceMatch[1]);
  } else if (flexMatch) {
    actions = extractPillsFromHtml(flexMatch[0]);
  }

  const prose = stripHtmlBlocks(withoutStageTag);

  return { prose, actions };
}
