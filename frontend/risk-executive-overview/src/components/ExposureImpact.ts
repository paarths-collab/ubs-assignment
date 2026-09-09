import type { AppContext } from "../state/AppContext";
import { el } from "./dom";
import { formatUsd, formatPercent } from "../services/format";

const money = (value: number | null): string => (value == null ? "Not applicable" : formatUsd(value));

function line(label: string, value: string, emphasis = false): HTMLElement {
  return el("div", { className: `exposure-line${emphasis ? " is-emphasis" : ""}` }, [
    el("span", { className: "exposure-line__label" }, [label]),
    el("span", { className: "exposure-line__value" }, [value]),
  ]);
}

function column(title: string, caption: string, lines: HTMLElement[]): HTMLElement {
  return el("section", { className: "exposure-column" }, [
    el("h4", { className: "exposure-column__title" }, [title]),
    el("p", { className: "exposure-column__caption" }, [caption]),
    el("div", { className: "exposure-column__lines" }, lines),
  ]);
}

export function renderExposureImpact(ctx: AppContext, host: HTMLElement): void {
  function sync(): void {
    const { overview } = ctx.getState();
    if (!overview) {
      host.replaceChildren(el("div", { className: "empty-state" }, ["No exposure data yet."]));
      return;
    }

    const { realised, potential, operational } = overview.exposure;
    const total = potential.totalUsd ?? 0;

    host.replaceChildren(
      el("div", { className: "exposure-grid" }, [
        column("Realised financial exposure", "Financial events only — Non-Financial events structurally carry none.", [
          line("Gross", money(realised.grossAmountUsd)),
          line("Recovery", money(realised.recoveryAmountUsd)),
          line("Net", money(realised.netAmountUsd), true),
          line("Recovery rate", realised.recoveryRate == null ? "Not applicable" : formatPercent(realised.recoveryRate)),
        ]),

        column("Potential exposure", "Spans both event types — this is where Non-Financial risk shows up.", [
          line("Potential impact", money(potential.totalUsd), true),
          line(
            "From Financial",
            potential.fromFinancialUsd == null
              ? "None recorded"
              : `${formatUsd(potential.fromFinancialUsd)} · ${total ? formatPercent(potential.fromFinancialUsd / total) : "—"}`,
          ),
          line(
            "From Non-Financial",
            potential.fromNonFinancialUsd == null
              ? "None recorded"
              : `${formatUsd(potential.fromNonFinancialUsd)} · ${total ? formatPercent(potential.fromNonFinancialUsd / total) : "—"}`,
          ),
        ]),

        column("Operational burden", "Remediation effort recorded against the filtered population.", [
          line("Remediation hours", `${operational.totalRemediationHours.toLocaleString()} hrs`, true),
          line("Average per event", `${operational.averagePerEvent} hrs`),
          line("Maximum per event", `${operational.maxPerEvent} hrs`),
        ]),
      ]),
    );
  }

  ctx.subscribe(sync);
  sync();
}
