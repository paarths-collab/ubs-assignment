"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Data, Layout } from "plotly.js";
import { useColorMode } from "@/components/color-theme";

export type Chart = { type: "bar" | "line" | "pie" | "scatter"; title: string;
  x_label: string; y_label: string; points: { x: string | number; y: string | number | null }[]; caveats: string[] };
export type Result = { columns: string[]; types?: Record<string, string>; rows: Record<string, unknown>[]; returned_rows: number; truncated: boolean };
export type Anomalies = { rule: string; measure: string; group: string | null; flagged_count: number;
  caveats: string[]; groups: Record<string, unknown>[] };

// Plotly supports HTML-like labels; escape every untrusted string at that boundary.
const plain = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function Plot({ chart }: { chart: Chart }) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const mode = useColorMode();
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    import("plotly.js-basic-dist-min").then(async ({ default: Plotly }) => {
      if (disposed) return;
      const x = chart.points.map(p => typeof p.x === "number" ? p.x : plain(p.x));
      const y = chart.points.map(p => p.y === null ? null : Number(p.y));
      const colors = ["#ed936e", "#f3ae87", "#f6c5a5", "#d4a98c", "#aa8a75", "#7e6b5e"];
      const theme = getComputedStyle(document.documentElement);
      const surface = theme.getPropertyValue("--surface").trim();
      const foreground = theme.getPropertyValue("--primary").trim();
      const secondary = theme.getPropertyValue("--secondary").trim();
      const border = theme.getPropertyValue("--border").trim();
      const family = getComputedStyle(document.body).fontFamily;
      const trace: Data = chart.type === "pie" ? {
        type: "pie", labels: x, values: y as number[], textinfo: "label+percent", textposition: "outside", marker: { colors, line: { color: surface, width: 2 } },
        hovertemplate: "%{label}: %{value} (%{percent})<extra></extra>",
      } : { type: chart.type === "bar" ? "bar" : "scatter", x, y,
        mode: chart.type === "line" ? "lines+markers" : "markers", connectgaps: false,
        name: plain(chart.y_label), marker: { color: colors[0], size: chart.type === "scatter" ? 6 : 4 }, line: { color: colors[0], width: 2 },
        hovertemplate: "%{x}: %{y}<extra></extra>" };
      const layout: Partial<Layout> = { autosize: true, height: 340, hoverlabel: { bgcolor: surface, bordercolor: border, font: { color: foreground, family, size: 12 } },
        paper_bgcolor: surface, plot_bgcolor: surface, font: { color: secondary, family, size: 12 },
        title: { text: plain(chart.title) }, margin: { l: 65, r: 24, t: 70, b: 80 },
        xaxis: { title: { text: plain(chart.x_label) }, automargin: true, gridcolor: border },
        yaxis: { rangemode: chart.type === "bar" ? "tozero" : "normal", title: { text: plain(chart.y_label) }, automargin: true, gridcolor: border },
        showlegend: true, legend: { orientation: "h", y: -0.35 } };
      // The observer below owns resizing, including visibility and unmount checks.
      await Plotly.newPlot(target, [trace], layout, { responsive: false, displayModeBar: false, staticPlot: false });
      if (disposed) { Plotly.purge(target); return; }
      setReady(true);
      const displayed = () => !disposed && target.isConnected && target.getClientRects().length > 0
        && target.clientWidth > 0 && target.clientHeight > 0;
      let resizing = false;
      const observer = new ResizeObserver(() => {
        if (!displayed() || resizing) return;
        resizing = true;
        void (async () => {
          try {
            await Plotly.Plots.resize(target);
          } catch {
            // Plotly defers resizing; the user can switch tabs or navigate during that delay.
            if (displayed()) setError("Chart could not resize. The supporting table remains available.");
          } finally {
            resizing = false;
          }
        })();
      });
      observer.observe(target);
      cleanup = () => { observer.disconnect(); Plotly.purge(target); };
    }).catch(() => { if (!disposed) setError("Chart could not render. The supporting table remains available."); });
    return () => { disposed = true; cleanup?.(); };
  }, [chart, mode]);
  return <>{!ready && !error && <p role="status">Loading chart…</p>}{error && <p role="alert">{error}</p>}<div ref={element} className="analysis-plot" role="img"
    aria-label={`${chart.title}. ${chart.x_label} against ${chart.y_label}. Values available in the Table tab.`} /></>;
}

export function ResultTable({ table, caption = "Executed result values" }: { table: Result; caption?: string }) {
  return <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}><table>
    <caption>{caption}</caption><thead><tr>{table.columns.map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead>
    <tbody>{table.rows.map((row, i) => <tr key={i}>{table.columns.map(c => <td key={c}
      className={typeof row[c] === "number" || /^(DECIMAL|DOUBLE|FLOAT|.*INT)/.test(table.types?.[c] ?? "") ? "numeric" : undefined}>
      {row[c] === null ? "null" : String(row[c])}</td>)}</tr>)}</tbody></table>
    {!table.rows.length && <p>No result rows.</p>}</div>;
}

export function AnalysisEvidence({ table, charts = [], interactive = false }: { table: Result; charts?: Chart[]; interactive?: boolean }) {
  const [tab, setTab] = useState<"chart" | "table">(charts.length ? "chart" : "table");
  const [chartIndex, setChartIndex] = useState(0);
  const [viewType, setViewType] = useState<Chart["type"] | null>(null);
  const savedChart = charts[Math.min(chartIndex, charts.length - 1)];
  const chart = useMemo(() => savedChart ? { ...savedChart, type: viewType ?? savedChart.type } : undefined, [savedChart, viewType]);
  const canUsePie = !!savedChart && savedChart.points.length <= 12 && savedChart.points.some(point => Number(point.y) > 0) && savedChart.points.every(point => point.y !== null && Number.isFinite(Number(point.y)) && Number(point.y) >= 0);
  const id = useId();
  return <><p>{table.returned_rows} result rows shown{table.truncated ? " · Truncated at 500 rows; omitted values are not shown." : ""}</p>
    {charts.length > 0 && <div role="tablist" aria-label="Result representation">{(["chart", "table"] as const).map(t =>
      <button key={t} role="tab" id={`${id}-${t}`} aria-controls={`${id}-panel`} aria-selected={tab === t}
        tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)} onKeyDown={e => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault(); const next = e.key === "Home" ? "chart" : e.key === "End" ? "table" : tab === "chart" ? "table" : "chart";
            setTab(next); document.getElementById(`${id}-${next}`)?.focus();
          }
        }}>{t === "chart" ? "Chart" : "Table"}</button>)}</div>}
    {interactive && tab === "chart" && chart && <div className="chart-controls">
      {charts.length > 1 && <label>Chart view<select aria-label="Choose chart" value={chartIndex} onChange={event => { setChartIndex(Number(event.target.value)); setViewType(null); }}>{charts.map((item, index) => <option key={index} value={index}>{item.title}</option>)}</select></label>}
      <div role="group" aria-label="Chart display type"><span>Display as</span>{(["bar", "line", "pie", "scatter"] as const).map(type => <button key={type} type="button" aria-pressed={chart.type === type} disabled={type === "pie" && !canUsePie} onClick={() => setViewType(type)}>{type === "bar" ? "Bars" : type === "line" ? "Line" : type === "pie" ? "Pie" : "Points"}</button>)}</div>
      <small>View only · Computed values stay the same</small>
    </div>}
    <div id={`${id}-panel`} role={charts.length ? "tabpanel" : undefined} aria-labelledby={charts.length ? `${id}-${tab}` : undefined}>
      {tab === "chart" && chart ? <Plot chart={chart} /> : <ResultTable table={table} />}
    </div>{savedChart?.caveats.map(c => <p className="chart-caveat" key={c}>{c}</p>)}</>;
}

export function AnomalySummary({ value }: { value: Anomalies }) {
  return <section aria-label="Anomaly evidence"><h4>Anomaly evidence: {value.measure}</h4>
    <p>{value.rule}</p><p>Grouping: {value.group ?? "Entire dataset"} · {value.flagged_count} flagged records</p>
    <ResultTable table={{ columns: ["group_value", "status", "sample_size", "null_count", "q1", "q3", "lower_bound", "upper_bound", "flagged_count"],
      rows: value.groups, returned_rows: value.groups.length, truncated: false }} caption="IQR baseline, thresholds, and verdict per group" />
    {value.caveats.map(c => <p key={c}>{c}</p>)}</section>;
}
