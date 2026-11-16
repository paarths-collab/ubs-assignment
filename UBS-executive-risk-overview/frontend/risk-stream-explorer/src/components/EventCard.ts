import type { StreamEvent } from "@backend/index";
import { formatDays, formatMoney, shortOrganisationName } from "@backend/index";
import { el } from "./dom";
import { severityBadge, eventTypeBadge } from "./badges";

/**
 * Event titles arrive as "Organisation / Unit / Issue type". The issue type
 * is the part that actually says what happened, so it leads the card; the
 * organisation and unit move down to the identifier line where they belong.
 */
function splitTitle(eventTitle: string): { headline: string; unit: string | null } {
  const parts = eventTitle
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) return { headline: parts[parts.length - 1]!, unit: parts[1]! };
  if (parts.length === 2) return { headline: parts[1]!, unit: null };
  return { headline: eventTitle, unit: null };
}

function amountBlock(event: StreamEvent): HTMLElement {
  if (event.netAmount !== null) {
    return el("div", { className: "event-card__amount" }, [
      el("span", { className: "event-card__amount-label" }, ["Net amount"]),
      el("span", { className: "event-card__amount-value" }, [formatMoney(event.netAmount)]),
    ]);
  }
  if (event.potentialImpact !== null) {
    return el("div", { className: "event-card__amount" }, [
      el("span", { className: "event-card__amount-label" }, ["Potential impact"]),
      el("span", { className: "event-card__amount-value" }, [formatMoney(event.potentialImpact)]),
    ]);
  }
  return el("div", { className: "event-card__amount" }, [
    el("span", { className: "event-card__amount-label" }, ["Amount"]),
    el("span", { className: "event-card__amount-value is-empty" }, ["Not recorded"]),
  ]);
}

export function renderEventCard(event: StreamEvent, onClick: () => void): HTMLElement {
  const { headline, unit } = splitTitle(event.eventTitle);
  const org = shortOrganisationName(event.ownerOrganisation);

  return el(
    "button",
    {
      type: "button",
      className: `event-card event-card--${event.severity.toLowerCase()}`,
      onclick: onClick,
      "aria-label": `Open event ${event.eventId}: ${headline}`,
    },
    [
      el("div", { className: "event-card__top" }, [
        el("div", { className: "event-card__badges" }, [
          severityBadge(event.severity),
          eventTypeBadge(event.eventType),
        ]),
        amountBlock(event),
      ]),

      el("div", { className: "event-card__headline" }, [headline]),
      el("div", { className: "event-card__ids" }, [
        el("span", { className: "event-card__id" }, [event.eventId]),
        el("span", {}, [org]),
        ...(unit ? [el("span", {}, [unit])] : []),
      ]),

      el("p", { className: "event-card__description" }, [event.issueDetail]),

      el("div", { className: "event-card__meta" }, [
        el("span", {}, [el("span", { className: "event-card__meta-label" }, ["Theme "]), event.riskTheme]),
        el("span", {}, [el("span", { className: "event-card__meta-label" }, ["Cause "]), event.rootCause]),
        el("span", {}, [
          el("span", { className: "event-card__meta-label" }, ["Recorded "]),
          `${formatDays(event.recordingDelayDays)} after occurrence`,
        ]),
      ]),
    ],
  );
}
