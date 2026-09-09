import { el } from "./dom";

const KNOWN_LABELS = ["Observed", "Why it matters", "Drivers", "Investigate", "Control considerations"];
const HEADER_RE = new RegExp(`^(${KNOWN_LABELS.join("|")}):\\s*(.*)$`);

interface Section {
  label: string | null;
  lines: string[];
}

function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { label: null, lines: [] };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    const match = HEADER_RE.exec(line.trim());
    if (match) {
      if (current.label !== null || current.lines.some((l) => l.trim().length > 0)) {
        sections.push(current);
      }
      current = { label: match[1] ?? null, lines: match[2] ? [match[2]] : [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.label !== null || current.lines.some((l) => l.trim().length > 0)) {
    sections.push(current);
  }
  return sections;
}

/**
 * Renders raw LLM text safely — every piece of text is inserted as a DOM
 * text node (via the `el` helper), never through innerHTML, so nothing the
 * model returns can execute as markup. Recognises the section-label
 * convention from the system prompt and "- "/"* " bullet lines; anything
 * else falls back to plain paragraphs.
 */
export function renderLLMAnswer(text: string): HTMLElement {
  const sections = parseSections(text);
  const container = el("div", { className: "ai-answer" });

  for (const section of sections) {
    const bulletLines = section.lines.filter((l) => /^\s*[-*]\s+/.test(l));
    const paragraphLines = section.lines.filter((l) => !/^\s*[-*]\s+/.test(l) && l.trim().length > 0);

    const blockChildren: (HTMLElement | null)[] = [];
    if (section.label) {
      blockChildren.push(el("div", { className: "ai-answer__block-label" }, [section.label]));
    }
    for (const para of paragraphLines) {
      blockChildren.push(el("div", { className: "ai-answer__text" }, [para.trim()]));
    }
    if (bulletLines.length > 0) {
      blockChildren.push(
        el(
          "ul",
          { className: "ai-answer__list" },
          bulletLines.map((l) => el("li", {}, [l.replace(/^\s*[-*]\s+/, "").trim()])),
        ),
      );
    }
    if (blockChildren.some(Boolean)) {
      container.append(el("div", {}, blockChildren));
    }
  }

  if (container.children.length === 0) {
    container.append(el("div", { className: "ai-answer__text" }, [text.trim() || "(empty response)"]));
  }

  return container;
}
