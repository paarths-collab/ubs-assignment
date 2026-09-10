import { el } from "./dom";

const KNOWN_LABELS = ["Observed", "Why it matters", "Drivers", "Investigate", "Control considerations", "Day-by-day events", "Supporting evidence"];
const HEADER_RE = new RegExp(`^\\**(${KNOWN_LABELS.join("|")})\\**:\\s*(.*)$`);

interface Section {
  label: string | null;
  lines: string[];
}

export type FollowUpHandler = (question: string, section: string) => void;

function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { label: null, lines: [] };

  for (const rawLine of text.split("\n")) {
    // Providers sometimes add Markdown emphasis despite the plain-text
    // contract. Strip only heading emphasis so all model content remains
    // safely rendered as text nodes.
    const line = rawLine.trimEnd().replace(/^\s*#{1,3}\s+/, "");
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
export function renderLLMAnswer(text: string, onFollowUp?: FollowUpHandler): HTMLElement {
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
    if (section.label && onFollowUp) {
      const toggle = el("button", { type: "button", className: "ai-followup__toggle" }, ["Ask follow-up"]);
      const input = el("input", {
        type: "text",
        className: "ai-followup__input",
        placeholder: `Ask a follow-up about ${section.label.toLowerCase()}…`,
        maxLength: 500,
        hidden: true,
        "aria-label": `Follow-up question about ${section.label}`,
      }) as HTMLInputElement;
      const send = el("button", { type: "submit", className: "ai-followup__button", hidden: true }, ["Send"]);
      toggle.addEventListener("click", () => {
        toggle.hidden = true;
        input.hidden = false;
        send.hidden = false;
        input.focus();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          input.value = "";
          input.hidden = true;
          send.hidden = true;
          toggle.hidden = false;
        }
      });
      const form = el("form", { className: "ai-followup", onsubmit: (event: Event) => {
        event.preventDefault();
        const question = input.value.trim();
        if (question) onFollowUp(question, section.label as string);
      } }, [toggle, input, send]);
      blockChildren.push(form);
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
