import { el } from "./dom";

export interface BreadcrumbEntry {
  id: string;
  label: string;
}

/**
 * Renders a breadcrumb trail of the entities the analyst has drilled into,
 * e.g. "Silverline › Instruction Processing Gap › Data Quality / Mapping
 * Error". Clicking any entry except the last re-roots the flow there;
 * `onNavigate` receives the clicked entry's index into `trail`.
 */
export function renderBreadcrumb(
  container: HTMLElement,
  trail: BreadcrumbEntry[],
  onNavigate: (index: number) => void,
): void {
  container.replaceChildren();

  if (trail.length === 0) {
    return;
  }

  trail.forEach((entry, index) => {
    if (index > 0) {
      // Add separator before each entry except the first
      container.appendChild(
        el("span", {
          className: "flow-breadcrumb-sep",
          text: "›",
          attrs: { "aria-hidden": "true" },
        })
      );
    }

    if (index === trail.length - 1) {
      // Last entry is plain text (current position)
      container.appendChild(
        el("span", { className: "flow-breadcrumb-current", text: entry.label })
      );
    } else {
      // Clickable button for all entries except the last
      const button = el("button", {
        className: "flow-breadcrumb-link",
        text: entry.label,
        attrs: { type: "button" },
      });
      button.addEventListener("click", () => {
        onNavigate(index);
      });
      container.appendChild(button);
    }
  });
}
