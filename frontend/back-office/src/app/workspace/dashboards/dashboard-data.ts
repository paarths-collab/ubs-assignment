import type { Chart, Result } from "@/components/analysis-evidence";

export type Filters = { organisation: string; eventType: "All" | "Financial" | "Non-Financial"; severity: "All" | "Low" | "Moderate" | "High"; dateFrom?: string; dateTo?: string };
export const initialFilters: Filters = { organisation: "Enterprise-wide", eventType: "All", severity: "All" };
export type Metadata = { recordCount: number; dateRange: { min: string; max: string }; organisations: string[] };
type Amount = number | null;
export type Overview = {
  filters: Filters & { dateFrom: string; dateTo: string };
  eventCount: number; datasetEventCount: number;
  composition: {
    severity: Record<string, number>; eventType: Record<string, number>;
    workflow: { open: number; closed: number; cancelled: number; highStillOpen: number };
    organisations: { key: string; eventCount: number; openEventCount: number; highSeverityCount: number; netAmountUsd: Amount; potentialImpactUsd: Amount }[];
  };
  distributions: { severity: Record<string, number>; status: Record<string, number>; eventType: Record<string, number> };
  exposure: {
    realised: { grossAmountUsd: Amount; recoveryAmountUsd: Amount; netAmountUsd: Amount; recoveryRate: Amount };
    potential: { totalUsd: Amount; fromFinancialUsd: Amount; fromNonFinancialUsd: Amount };
    operational: { totalRemediationHours: number; averagePerEvent: number; maxPerEvent: number };
  };
};
export type DashboardView = "overview" | "exposure" | "workflow";
export type Card = { id: string; title: string; description: string; method: string; table: Result; charts: Chart[] };
export const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
export const money = (value: Amount) => value === null ? "Not applicable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
export const percent = (numerator: number, denominator: number) => denominator > 0 ? `${(numerator / denominator * 100).toFixed(1)}%` : "—";

function card(id: string, title: string, description: string, method: string, category: string, measure: string, points: { x: string; y: Amount }[]): Card {
  return { id, title, description, method,
    table: { columns: [category, measure], rows: points.map(point => ({ [category]: point.x, [measure]: point.y })), returned_rows: points.length, truncated: false },
    charts: [{ title, type: "bar", x_label: category, y_label: measure, points, caveats: [] }],
  };
}

export function dashboardCards(data: Overview, view: DashboardView): Card[] {
  const { composition, exposure, distributions } = data;
  const severity = card("severity", "Severity distribution", `${number(composition.severity.High ?? 0)} high-severity events in the selected population.`, "Count of source records by severity, after the active filters.", "Severity", "Events", ["Low", "Moderate", "High"].map(x => ({ x, y: composition.severity[x] ?? 0 })));
  const realised = card("realised", "Realised exposure", `${money(exposure.realised.netAmountUsd)} net exposure across financial events.`, "Sum of gross, recovery and net USD amounts for financial records. Null means no applicable financial value; recoveries are shown separately, not added to net.", "Measure", "USD", [{ x: "Gross", y: exposure.realised.grossAmountUsd }, { x: "Recovered", y: exposure.realised.recoveryAmountUsd }, { x: "Net", y: exposure.realised.netAmountUsd }]);
  const organisationMetric = view === "workflow" ? "openEventCount" : view === "exposure" ? "netAmountUsd" : "eventCount";
  const sorted = [...composition.organisations].sort((a, b) => (b[organisationMetric] ?? -Infinity) - (a[organisationMetric] ?? -Infinity));
  const top = sorted.slice(0, 5);
  const orgMeasure = view === "workflow" ? "Open events" : view === "exposure" ? "Net USD" : "Events";
  const organisations = card(`organisations-${view}`, "Organisation concentration", `${number(composition.organisations.length)} organisations represented; showing the top ${top.length} by ${orgMeasure.toLowerCase()}.`, "Group filtered records by owner organisation, rank by the selected measure, and display the five largest groups. The chart is a ranked subset, not the whole population.", "Owner organisation", orgMeasure, top.map(row => ({ x: row.key, y: row[organisationMetric] })));
  const workflow = card("workflow", "Workflow & backlog", `${number(composition.workflow.open)} open events; ${number(composition.workflow.highStillOpen)} are high severity.`, "Open backlog excludes Closed and Cancelled statuses according to the backend business rule. Closed and cancelled records are shown separately.", "Workflow", "Events", [{ x: "Open", y: composition.workflow.open }, { x: "Closed", y: composition.workflow.closed }, { x: "Cancelled", y: composition.workflow.cancelled }]);
  const potential = card("potential", "Potential impact", `${money(exposure.potential.totalUsd)} recorded potential impact.`, "Sum of non-null potential impact USD amounts by event type. Potential impact is a separate scenario measure; it is not added to realised exposure.", "Event type", "Potential USD", [{ x: "Financial", y: exposure.potential.fromFinancialUsd }, { x: "Non-Financial", y: exposure.potential.fromNonFinancialUsd }]);
  const status = card("status", "Recorded status", "The current status of every event in this scope.", "Count of filtered source records by their recorded status. A status snapshot does not establish a time trend.", "Status", "Events", Object.entries(distributions.status).sort((a, b) => b[1] - a[1]).map(([x, y]) => ({ x, y })));
  return view === "exposure" ? [realised, potential, organisations, severity] : view === "workflow" ? [workflow, status, organisations, severity] : [severity, realised, organisations, workflow];
}
