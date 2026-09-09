import type { StreamEvent } from "@backend/index";
import { formatDays, formatMoney, shortOrganisationName } from "@backend/index";
import { el } from "./dom";
import { severityBadge, eventTypeBadge } from "./badges";

export function renderEventCard(event: StreamEvent, onClick: () => void): HTMLElement {
  const hasNet = event.netAmount !== null;
  const hasImpact = event.potentialImpact !== null;

  return el(
    "button",
    {
      type: "button",
      className: "event-card",
      onclick: onClick,
      "aria-label": `Open event ${event.eventId}: ${event.eventTitle}`,
    },
    [
      el("div", { className: "event-card__badges" }, [severityBadge(event.severity), eventTypeBadge(event.eventType)]),
      el("div", { className: "event-card__body" }, [
        el("div", { className: "event-card__title" }, [`${event.eventId} — ${event.eventTitle}`]),
        el("div", { className: "event-card__meta" }, [
          el("span", {}, [el("strong", {}, [shortOrganisationName(event.ownerOrganisation)])]),
          el("span", {}, [event.riskTheme]),
          el("span", {}, [event.rootCause]),
          el("span", {}, [`Recording delay: ${formatDays(event.recordingDelayDays)}`]),
        ]),
      ]),
      el("div", { className: "event-card__figures" }, [
        hasNet
          ? el("div", {}, [el("span", { className: "label" }, ["Net"]), formatMoney(event.netAmount)])
          : hasImpact
            ? el("div", {}, [el("span", { className: "label" }, ["Potential"]), formatMoney(event.potentialImpact)])
            : el("div", { className: "label" }, ["No amount"]),
      ]),
    ],
  );
}
