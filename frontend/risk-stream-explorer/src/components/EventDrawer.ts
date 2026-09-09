import {
  renderEventDetailSections,
  shortOrganisationName,
  type EventInsightIntent,
  type RenderedField,
} from "@backend/index";
import type { AppContext } from "../state/AppContext";
import { el } from "./dom";
import { renderAIPanel } from "./AIInsightPanel";

const EVENT_AI_ACTIONS: { intent: EventInsightIntent; label: string }[] = [
  { intent: "summarise_event", label: "Summarise event" },
  { intent: "why_it_matters", label: "Why does this matter?" },
  { intent: "what_to_investigate", label: "What should I investigate?" },
  { intent: "suggest_controls", label: "Suggest controls" },
  { intent: "find_similar_events", label: "Find similar events" },
  { intent: "explain_reporting_delay", label: "Explain reporting delay" },
];

function fieldValue(field: RenderedField): HTMLElement {
  if (field.value === null || field.value === "") {
    return el("div", { className: "detail-field__value is-empty" }, ["Not available"]);
  }
  if (field.format === "currency-preformatted") {
    return el("div", { className: "detail-field__value" }, [String(field.value)]);
  }
  if (field.format === "days") {
    return el("div", { className: "detail-field__value" }, [`${field.value} days`]);
  }
  return el("div", { className: "detail-field__value" }, [String(field.value)]);
}

export function renderEventDrawer(ctx: AppContext, container: HTMLElement): void {
  const overlay = el("div", { className: "drawer-overlay", onclick: () => ctx.closeDrawer() });
  const drawer = el("div", {
    className: "drawer",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Event investigation",
  });
  container.append(overlay, drawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ctx.getState().eventDrawerOpen) ctx.closeDrawer();
  });

  function draw(): void {
    const state = ctx.getState();
    const isOpen = state.eventDrawerOpen && state.selectedEventId !== null;
    overlay.classList.toggle("is-open", isOpen);
    drawer.classList.toggle("is-open", isOpen);

    if (!isOpen || !state.selectedEventId) {
      drawer.innerHTML = "";
      return;
    }

    const event = ctx.repository.getById(state.selectedEventId);
    const detail = ctx.repository.getDetailById(state.selectedEventId);
    if (!event || !detail) {
      drawer.innerHTML = "";
      drawer.append(el("div", { className: "error-state" }, ["This event could not be found."]));
      return;
    }

    drawer.innerHTML = "";
    drawer.append(
      el("div", { className: "drawer__header" }, [
        el("div", {}, [
          el("div", { className: "drawer__title" }, [event.eventTitle]),
          el("div", { className: "drawer__subtitle" }, [`${event.eventId} · ${shortOrganisationName(event.ownerOrganisation)}`]),
        ]),
        el(
          "button",
          { type: "button", className: "drawer__close", "aria-label": "Close event drawer", onclick: () => ctx.closeDrawer() },
          ["×"],
        ),
      ]),
    );

    const body = el("div", { className: "drawer__body" });

    const sections = renderEventDetailSections(detail);
    sections.forEach((section, i) => {
      const sectionEl = el("div", { className: "detail-section", "data-open": String(i === 0) });
      const bodyEl = el("div", { className: "detail-section__body" }, [
        ...section.fields.map((f) =>
          el("div", { className: "detail-field" }, [
            el("div", { className: "detail-field__label" }, [f.label]),
            fieldValue(f),
          ]),
        ),
      ]);
      bodyEl.style.display = i === 0 ? "grid" : "none";

      const header = el(
        "button",
        {
          type: "button",
          className: "detail-section__header",
          "aria-expanded": String(i === 0),
          onclick: () => {
            const isNowOpen = sectionEl.getAttribute("data-open") !== "true";
            sectionEl.setAttribute("data-open", String(isNowOpen));
            header.setAttribute("aria-expanded", String(isNowOpen));
            bodyEl.style.display = isNowOpen ? "grid" : "none";
          },
        },
        [section.title, el("span", { className: "detail-section__chevron" }, ["›"])],
      );

      sectionEl.append(header, bodyEl);
      body.append(sectionEl);
    });

    const aiHost = el("div", { className: "ai-panel", style: "margin-top:16px" });
    renderAIPanel(
      aiHost,
      EVENT_AI_ACTIONS,
      (intent) => ctx.aiRepository.getEventInsight(intent, event.eventId, state.filters),
      "AI Risk Analyst — Event",
    );
    body.append(aiHost);

    drawer.append(body);
  }

  ctx.subscribe(draw);
  draw();
}
