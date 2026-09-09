import * as d3 from "d3";
import {
  buildStreamSeriesData,
  computePeriodMetrics,
  getEventsInPeriod,
  type Period,
  type StreamEvent,
  type StreamPoint,
} from "@backend/index";
import type { AppContext } from "../state/AppContext";
import { generatePeriods } from "@backend/index";
import { el } from "./dom";
import { formatMoney, formatPercent } from "@backend/index";

const SEVERITY_COLORS: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#f5a623",
  High: "#ef4444",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  "Non-Financial": "#7c8794",
  Financial: "#3772ff",
};

// Categorical palette for risk-theme/organisation grouping — deliberately
// avoids red/green so those stay reserved for severity and positive/negative
// meaning elsewhere in the UI.
const CATEGORICAL_PALETTE = [
  "#3772ff", "#f5a623", "#7c5cff", "#22b8cf", "#ff8fab",
  "#8b95a5", "#5e9cff", "#c99b3f", "#a5a8ff", "#4fc3d9",
  "#ff9f6b", "#6dd3b0",
];

function colorFor(groupBy: string, key: string, allKeys: string[]): string {
  if (groupBy === "severity") return SEVERITY_COLORS[key] ?? "#666";
  if (groupBy === "eventType") return EVENT_TYPE_COLORS[key] ?? "#666";
  const idx = allKeys.indexOf(key);
  return CATEGORICAL_PALETTE[idx % CATEGORICAL_PALETTE.length] ?? "#666";
}

export function renderStreamGraph(ctx: AppContext, container: HTMLElement): void {
  const legendEl = el("div", { className: "streamgraph-legend" });
  const svgWrap = el("div", { className: "streamgraph-container" });
  // A normal in-flow HTML block below the chart — not an absolutely
  // positioned overlay — so hovering a period can never cover the graph
  // itself. It always reserves its own space; content swaps on hover/focus.
  const scorecard = el("div", { className: "streamgraph-scorecard", role: "status", "aria-live": "polite" });
  showScorecardPlaceholder(scorecard);
  const accessibleTableWrap = el("div", { className: "streamgraph-accessible-table" });

  container.append(legendEl, svgWrap, scorecard, accessibleTableWrap);

  function draw(): void {
    // The hit-rects driving hover are destroyed and rebuilt below, which
    // never fires a mouseleave — reset the scorecard to its placeholder
    // explicitly so it can't keep showing a previous period's data after
    // the underlying element is gone.
    showScorecardPlaceholder(scorecard);

    const state = ctx.getState();
    const filteredEvents = ctx.getFilteredEvents();
    const data = buildStreamSeriesData(filteredEvents, state.granularity, state.groupBy);
    const periods = generatePeriods(filteredEvents, state.granularity);

    renderLegend(legendEl, data.seriesKeys, state.groupBy, state.dimmedSeriesKey, ctx);
    renderAccessibleTable(accessibleTableWrap, data);

    if (data.points.length === 0) {
      svgWrap.querySelector("svg")?.remove();
      svgWrap.querySelector(".empty-state")?.remove();
      svgWrap.append(el("div", { className: "empty-state" }, ["No risk events match the selected filters."]));
      return;
    }
    svgWrap.querySelector(".empty-state")?.remove();

    drawSvg(svgWrap, scorecard, data, periods, filteredEvents, state, ctx);
  }

  ctx.subscribe(draw);
  draw();

  // The SVG's viewBox is sized from the container's measured pixel width at
  // draw time. If that width changes later (window resize, pane resize,
  // fonts/layout settling after first paint) without a redraw, the SVG's
  // CSS width:100% stretches it against a stale viewBox and distorts the
  // aspect ratio. Re-drawing on resize keeps the viewBox in sync.
  let resizeFrame: number | null = null;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => draw());
  });
  resizeObserver.observe(svgWrap);
}

function renderLegend(
  legendEl: HTMLElement,
  seriesKeys: string[],
  groupBy: string,
  dimmedKey: string | null,
  ctx: AppContext,
): void {
  legendEl.innerHTML = "";
  for (const key of seriesKeys) {
    const swatch = el("span", {
      className: "streamgraph-legend__swatch",
      style: `background:${colorFor(groupBy, key, seriesKeys)}`,
    });
    const isDimmed = dimmedKey !== null && dimmedKey !== key;
    const item = el(
      "button",
      {
        type: "button",
        className: `streamgraph-legend__item${isDimmed ? " is-dimmed" : ""}${dimmedKey === key ? " is-active" : ""}`,
        onclick: () => ctx.toggleDimSeries(dimmedKey === key ? null : key),
      },
      [swatch, key],
    );
    legendEl.append(item);
  }
}

function renderAccessibleTable(wrap: HTMLElement, data: { seriesKeys: string[]; points: StreamPoint[] }): void {
  wrap.innerHTML = "";
  const table = el("table", {}, [
    el("caption", {}, ["Timeline data as a table, for screen readers"]),
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Period"]),
        el("th", {}, ["Total"]),
        ...data.seriesKeys.map((k) => el("th", {}, [k])),
      ]),
    ]),
    el(
      "tbody",
      {},
      data.points.map((p) =>
        el("tr", {}, [
          el("td", {}, [p.label]),
          el("td", {}, [String(p.total)]),
          ...data.seriesKeys.map((k) => el("td", {}, [String(p.series[k] ?? 0)])),
        ]),
      ),
    ),
  ]);
  wrap.append(table);
}

function drawSvg(
  svgWrap: HTMLElement,
  scorecard: HTMLElement,
  data: { seriesKeys: string[]; points: StreamPoint[] },
  periods: Period[],
  filteredEvents: StreamEvent[],
  state: { granularity: string; groupBy: string; dimmedSeriesKey: string | null; selectedPeriodId: string | null },
  ctx: AppContext,
): void {
  svgWrap.querySelector("svg")?.remove();

  const width = Math.max(svgWrap.clientWidth || 900, 320);
  const height = 340;
  const margin = { top: 16, right: 24, bottom: 28, left: 44 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3
    .create("svg")
    .attr("class", "streamgraph-svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Risk event timeline stacked by " + state.groupBy);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scalePoint<number>()
    .domain(data.points.map((_, i) => i))
    .range([0, innerWidth])
    .padding(0.5);

  const stackData = d3
    .stack<StreamPoint>()
    .keys(data.seriesKeys)
    .value((point, key) => point.series[key] ?? 0)(data.points);

  const maxY = d3.max(stackData[stackData.length - 1] ?? [], (d) => d[1]) ?? 1;
  const y = d3.scaleLinear().domain([0, maxY * 1.08]).range([innerHeight, 0]).nice();

  // Gridlines
  g.append("g")
    .attr("class", "grid")
    .selectAll("line")
    .data(y.ticks(4))
    .join("line")
    .attr("class", "gridline")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", (d) => y(d))
    .attr("y2", (d) => y(d));

  const area = d3
    .area<d3.SeriesPoint<StreamPoint>>()
    .x((_, i) => x(i) ?? 0)
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(d3.curveMonotoneX);

  g.append("g")
    .selectAll("path")
    .data(stackData)
    .join("path")
    .attr("class", "stream-path")
    .attr("fill", (d) => colorFor(state.groupBy, d.key, data.seriesKeys))
    .attr("fill-opacity", 0.75)
    .attr("class", (d) => `stream-path${state.dimmedSeriesKey && state.dimmedSeriesKey !== d.key ? " is-dimmed" : ""}`)
    .attr("d", area);

  // Total line on top for a crisp "primary data line" per the executive-analytical style.
  const totalLine = d3
    .line<StreamPoint>()
    .x((_, i) => x(i) ?? 0)
    .y((d) => y(d.total))
    .curve(d3.curveMonotoneX);
  g.append("path")
    .attr("fill", "none")
    .attr("stroke", "var(--accent-primary)")
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.9)
    .attr("d", totalLine(data.points));

  // X axis: label every Nth point to avoid crowding on weekly view.
  const labelStep = Math.max(1, Math.ceil(data.points.length / 12));
  const xAxisG = g.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${innerHeight})`);
  xAxisG
    .append("line")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("stroke", "var(--border-hairline)");
  xAxisG
    .selectAll("text")
    .data(data.points.filter((_, i) => i % labelStep === 0))
    .join("text")
    .attr("x", (_, i) => x(i * labelStep) ?? 0)
    .attr("y", 16)
    .attr("text-anchor", "middle")
    .text((d) => d.label);

  const yAxisG = g.append("g").attr("class", "axis axis--y");
  yAxisG
    .selectAll("text")
    .data(y.ticks(4))
    .join("text")
    .attr("x", -10)
    .attr("y", (d) => y(d))
    .attr("dy", "0.32em")
    .attr("text-anchor", "end")
    .text((d) => String(d));

  // Selected-period marker
  const selectedIndex = data.points.findIndex((p) => p.periodId === state.selectedPeriodId);
  if (selectedIndex >= 0) {
    const sx = x(selectedIndex) ?? 0;
    g.append("line")
      .attr("class", "selected-line")
      .attr("x1", sx)
      .attr("x2", sx)
      .attr("y1", 0)
      .attr("y2", innerHeight);
  }

  // Interaction layer: one hit-rect per period.
  const bandWidth = innerWidth / Math.max(1, data.points.length);
  const hitG = g.append("g");
  data.points.forEach((point, i) => {
    const cx = x(i) ?? 0;
    hitG
      .append("rect")
      .attr("class", "period-hit")
      .attr("x", cx - bandWidth / 2)
      .attr("y", 0)
      .attr("width", bandWidth)
      .attr("height", innerHeight)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", `${point.label}: ${point.total} events. Click to investigate.`)
      .on("click", () => ctx.selectPeriod(point.periodId))
      .on("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          ctx.selectPeriod(point.periodId);
        }
      })
      .on("mouseenter", () => showScorecard(scorecard, point, periods, filteredEvents))
      .on("mouseleave", () => showScorecardPlaceholder(scorecard))
      .on("focus", () => showScorecard(scorecard, point, periods, filteredEvents));
  });

  svgWrap.append(svg.node()!);
}

function scorecardStat(label: string, value: string): HTMLElement {
  return el("div", { className: "streamgraph-scorecard__stat" }, [
    el("div", { className: "streamgraph-scorecard__stat-label" }, [label]),
    el("div", { className: "streamgraph-scorecard__stat-value" }, [value]),
  ]);
}

function showScorecardPlaceholder(scorecard: HTMLElement): void {
  scorecard.innerHTML = "";
  scorecard.classList.add("is-placeholder");
  scorecard.append(
    el("div", { className: "streamgraph-scorecard__hint" }, [
      "Hover a point on the timeline for a quick preview, or click it to investigate the full period below.",
    ]),
  );
}

/**
 * Renders period preview stats into a normal in-flow block below the chart
 * (never an overlay on top of it) so hovering the timeline can never hide
 * the lines/areas underneath — the exact problem with the old floating
 * tooltip implementation.
 */
function showScorecard(
  scorecard: HTMLElement,
  point: StreamPoint,
  periods: Period[],
  filteredEvents: StreamEvent[],
): void {
  const period = periods.find((p) => p.id === point.periodId);
  scorecard.innerHTML = "";
  scorecard.classList.remove("is-placeholder");

  const topSeries = Object.entries(point.series)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)[0];

  const stats: HTMLElement[] = [
    scorecardStat(point.label, `${point.total} events`),
    ...(topSeries ? [scorecardStat("Largest series", `${topSeries[0]} (${topSeries[1]})`)] : []),
  ];

  if (period) {
    const periodEvents = getEventsInPeriod(filteredEvents, period);
    const metrics = computePeriodMetrics(periodEvents, {
      periodId: period.id,
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
    });
    stats.push(
      scorecardStat("High severity", formatPercent(metrics.severityShares.High)),
      scorecardStat(
        "Net exposure",
        formatMoney(metrics.financial.netAmount.populatedCount > 0 ? metrics.financial.netAmount.total : null),
      ),
      scorecardStat(
        "Potential impact",
        formatMoney(metrics.financial.potentialImpact.populatedCount > 0 ? metrics.financial.potentialImpact.total : null),
      ),
    );
  }

  scorecard.append(
    el("div", { className: "streamgraph-scorecard__stats" }, stats),
    el("div", { className: "streamgraph-scorecard__hint" }, ["Click this point on the timeline to investigate the full period below."]),
  );
}
