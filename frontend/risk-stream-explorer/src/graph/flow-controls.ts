import { el } from "./dom";
import { FLOW_TEMPLATES, type FlowTemplateId } from "./flow-model";

/**
 * Which slice of the current root's flow is shown. "full" is the entire
 * configured chain for that entity type (through Risk Theme / OR Category);
 * "issues" and "causes" are shorter prefixes of that same chain; "people"
 * swaps in an alternate chain showing who (by role) touches the root's
 * events, instead of the issue/cause chain.
 */
export type FlowViewMode = "issues" | "causes" | "people" | "full";

export interface FlowControlsState {
  templateId: FlowTemplateId;
  viewMode: FlowViewMode;
  showEvents: boolean;
  /** Whether an entity is currently selected as the flow's root — Reset only does something when true. */
  hasRoot: boolean;
}

export interface FlowControlsCallbacks {
  onViewModeChange: (mode: FlowViewMode) => void;
  onTemplateChange: (templateId: FlowTemplateId) => void;
  onToggleEvents: (show: boolean) => void;
  onReset: () => void;
}

/**
 * Renders the flow toolbar: one saved template selector, an AI chooser,
 * a "show events" toggle, and a "Reset" button. Fully re-renders on every call —
 * the caller re-invokes this whenever state changes, so this function does
 * not need to diff anything itself.
 */
export function renderFlowControls(
  container: HTMLElement,
  state: FlowControlsState,
  callbacks: FlowControlsCallbacks,
): void {
  container.replaceChildren();

  const templateLabel = el("label", { className: "flow-template-label", text: "Template" });
  const templateSelect = document.createElement("select");
  templateSelect.className = "flow-template-select";
  templateSelect.setAttribute("aria-label", "Saved flow template");
  for (const template of FLOW_TEMPLATES) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    option.title = template.description;
    option.selected = template.id === state.templateId;
    templateSelect.appendChild(option);
  }
  templateSelect.addEventListener("change", () => callbacks.onTemplateChange(templateSelect.value as FlowTemplateId));
  templateLabel.appendChild(templateSelect);
  container.appendChild(templateLabel);

  // Build show events toggle
  const toggleBtn = el("button", {
    className: state.showEvents ? "flow-toggle-btn active" : "flow-toggle-btn",
    text: state.showEvents ? "Hide events" : "Show events",
    attrs: {
      type: "button",
      "aria-pressed": String(state.showEvents),
    },
  });

  toggleBtn.addEventListener("click", () => {
    callbacks.onToggleEvents(!state.showEvents);
  });

  container.appendChild(toggleBtn);

  // Build reset button
  const resetAttrs: Record<string, string> = { type: "button" };
  if (!state.hasRoot) {
    resetAttrs.disabled = "true";
  }

  const resetBtn = el("button", {
    className: "ghost-button flow-reset-btn",
    text: "Reset",
    attrs: resetAttrs,
  });

  resetBtn.addEventListener("click", () => {
    callbacks.onReset();
  });

  container.appendChild(resetBtn);
}
