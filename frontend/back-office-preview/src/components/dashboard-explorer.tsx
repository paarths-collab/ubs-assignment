"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, ChartNoAxesCombined, RotateCcw } from "lucide-react";
import { parseSalesSource, type SampleRow } from "@/lib/sample-data";
import styles from "./dashboard-explorer.module.css";

type Grouping = "month" | "region";
type Measure = "revenue" | "records";
type View = "bars" | "line";
type Group = { key: string; label: string; revenue: number; records: number; customers: number };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const number = (value: number) => new Intl.NumberFormat("en-US").format(value);
const monthLabel = (key: string) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

export function DashboardExplorer() {
  const [rows, setRows] = useState<SampleRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [grouping, setGrouping] = useState<Grouping>("month");
  const [measure, setMeasure] = useState<Measure>("revenue");
  const [view, setView] = useState<View>("bars");
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    fetch("/sample_data/analysis_flat.csv").then(response => {
      if (!response.ok) throw new Error("Data unavailable");
      return response.text();
    }).then(text => { if (current) setRows(parseSalesSource(text).rows); })
      .catch(() => { if (current) setLoadError(true); });
    return () => { current = false; };
  }, []);
  const groups = useMemo(() => {
    const buckets = new Map<string, { revenue: number; records: number; customers: Set<string> }>();
    for (const row of rows) {
      const key = grouping === "month" ? row.date.slice(0, 7) : row.region;
      const bucket = buckets.get(key) ?? { revenue: 0, records: 0, customers: new Set<string>() };
      bucket.revenue += row.revenue;
      bucket.records++;
      bucket.customers.add(row.customer);
      buckets.set(key, bucket);
    }
    return [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]): Group => ({ key, label: grouping === "month" ? monthLabel(key) : key, revenue: value.revenue, records: value.records, customers: value.customers.size }));
  }, [rows, grouping]);
  const selected = groups.find(group => group.key === active) ?? null;
  const relevant = selected ? rows.filter(row => (grouping === "month" ? row.date.slice(0, 7) : row.region) === selected.key) : rows;
  const revenue = relevant.reduce((sum, row) => sum + row.revenue, 0);
  const customers = new Set(relevant.map(row => row.customer)).size;
  const max = Math.max(1, ...groups.map(group => group[measure]));
  const points = groups.map((group, index) => ({ x: groups.length === 1 ? 50 : 8 + index * 84 / (groups.length - 1), y: 87 - Math.max(0, group[measure]) / max * 70 }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  function chooseGroup(key: string) { setActive(previous => previous === key ? null : key); }
  function chooseGrouping(value: Grouping) { setGrouping(value); setActive(null); }
  return <section className={styles.explorer} id="dashboard-preview" aria-labelledby="dashboard-preview-heading">
    <div className={styles.heading}><div><span className={styles.eyebrow}><i />INTERACTIVE PREVIEW</span><h2 id="dashboard-preview-heading">Explore a dashboard</h2><p>Change the measure and view, then select a point to focus the numbers below.</p></div><Link href="/#chat">Analyze your data <ArrowRight size={14} /></Link></div>
    <div className={styles.toolbar}>
      <div role="group" aria-label="Group results by"><span>Group by</span>{(["month", "region"] as const).map(value => <button key={value} type="button" aria-pressed={grouping === value} onClick={() => chooseGrouping(value)}>{value === "month" ? "Month" : "Region"}</button>)}</div>
      <div role="group" aria-label="Chart measure"><span>Measure</span>{(["revenue", "records"] as const).map(value => <button key={value} type="button" aria-pressed={measure === value} onClick={() => setMeasure(value)}>{value === "revenue" ? "Revenue" : "Records"}</button>)}</div>
      <div role="group" aria-label="Chart view"><span>View</span><button type="button" aria-label="Bar chart" aria-pressed={view === "bars"} onClick={() => setView("bars")}><BarChart3 size={15} /></button><button type="button" aria-label="Line chart" aria-pressed={view === "line"} onClick={() => setView("line")}><ChartNoAxesCombined size={15} /></button></div>
    </div>
    <div className={styles.body}>
      <div className={styles.chartPanel}><div className={styles.chartHeading}><div><span>{grouping === "month" ? "MONTHLY VIEW" : "REGIONAL VIEW"}</span><h3>{measure === "revenue" ? "Recorded revenue" : "Transaction count"} by {grouping}</h3></div><span>{rows.length ? `${groups.length} observed groups` : "Loading data"}</span></div>
        {loadError ? <div className={styles.empty}>The chart data could not load. <Link href="/#product">Open your sources</Link>.</div> : !rows.length ? <div className={styles.empty} role="status">Loading chart data…</div> : <>
          <div className={styles.plot} role="group" aria-label={`${measure === "revenue" ? "Revenue" : "Records"} by ${grouping}. Select a group to focus the summary.`}>
            {view === "bars" ? <div className={styles.bars}>{groups.map(group => <button type="button" key={group.key} aria-pressed={selected?.key === group.key} aria-label={`${group.label}: ${measure === "revenue" ? money(group.revenue) : `${group.records} records`}. Focus this group.`} onClick={() => chooseGroup(group.key)}><span>{measure === "revenue" ? money(group.revenue) : number(group.records)}</span><i style={{ height: `${Math.max(3, Math.max(0, group[measure]) / max * 100)}%` }} /><small>{group.label}</small></button>)}</div> : <div className={styles.line}><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="7" x2="93" y1="87" y2="87" /><line x1="7" x2="93" y1="52" y2="52" /><line x1="7" x2="93" y1="17" y2="17" /><path d={`${line} L${points.at(-1)?.x ?? 92},87 L${points[0]?.x ?? 8},87 Z`} className={styles.area} /><path d={line} className={styles.stroke} /></svg>{groups.map((group, index) => <button type="button" key={group.key} style={{ left: `${points[index].x}%`, top: `${points[index].y}%` }} aria-pressed={selected?.key === group.key} aria-label={`${group.label}: ${measure === "revenue" ? money(group.revenue) : `${group.records} records`}. Focus this point.`} onClick={() => chooseGroup(group.key)}><i /></button>)}<div className={styles.lineLabels}>{groups.map(group => <span key={group.key}>{group.label}</span>)}</div></div>}
          </div>
          <div className={styles.legend}><span><i />{measure === "revenue" ? "Revenue · USD" : "Source records"}</span><button type="button" onClick={() => setActive(null)} disabled={!selected}><RotateCcw size={12} />Clear focus</button></div>
        </>}
      </div>
      <aside className={styles.details}><div className={styles.detailHeading}><span>{selected ? "FOCUSED GROUP" : "FULL VIEW"}</span><strong>{selected?.label ?? "Overview"}</strong></div><div className={styles.primaryMetric}><span>Recorded revenue</span><strong>{rows.length ? money(revenue) : "—"}</strong></div><div className={styles.miniMetrics}><div><strong>{rows.length ? number(relevant.length) : "—"}</strong><span>Transactions</span></div><div><strong>{rows.length ? number(customers) : "—"}</strong><span>Customers</span></div></div><div className={styles.groupList}><span>Explore groups</span>{groups.map(group => <button type="button" key={group.key} aria-pressed={selected?.key === group.key} onClick={() => chooseGroup(group.key)}><span>{group.label}</span><strong>{measure === "revenue" ? money(group.revenue) : number(group.records)}</strong><ArrowRight size={12} /></button>)}</div><p>Calculated from the included dataset. Focusing this view leaves saved dashboards unchanged.</p></aside>
    </div>
  </section>;
}
