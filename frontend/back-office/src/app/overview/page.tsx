"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, CheckCheck, ChevronDown, CircleHelp, Database, FileSpreadsheet, Layers3, LoaderCircle, Plus, Table2 } from "lucide-react";
import { api, ApiError, clearPrivateState, uploadDatasets } from "@/lib/api";
import { WorkspaceActivity, WorkspaceJourney } from "@/components/workspace-activity";
import styles from "./overview.module.css";

type Column = { id: string; name: string; type: string; missing_count: number; missing_rate: number };
type Dataset = { id: string; display_name: string; version: number; profile: { row_count: number; column_count: number; duplicate_row_count: number; columns: Column[]; warnings: string[] } };
type Preview = { columns: Column[]; rows: Record<string, string | number | null>[]; returned_rows: number; total_rows: number; truncated: boolean };
type Slice = { name: string; value: number; color: string };
const colors = ["#f47e54", "#f6a176", "#f8bd98", "#fbd9bf", "#e8c0a5", "#d6aa8d"];
const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
const currency = (value: number, usd: boolean, compact = false) => new Intl.NumberFormat("en-US", { ...(usd ? { style: "currency", currency: "USD" } : {}), maximumFractionDigits: compact ? 0 : 2, minimumFractionDigits: usd && !compact ? 2 : 0 }).format(value);
const numeric = (value: string | number | null) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const monthName = (month: string, full = false) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: full ? "long" : "short", ...(full ? { year: "numeric" } : {}), timeZone: "UTC" });

function Donut({ slices, center, subtitle, format }: { slices: Slice[]; center: string; subtitle: string; format: (value: number) => string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return <div className={styles.donut}><svg viewBox="0 0 180 180" role="img" aria-label={slices.map(slice => `${slice.name}: ${format(slice.value)}`).join(", ")}>
    <circle cx="90" cy="90" r="61" fill="none" stroke="#f2f3f5" strokeWidth="27" />
    {slices.map((slice, index) => {
      const fraction = total ? slice.value / total : 0;
      const start = total ? slices.slice(0, index).reduce((sum, item) => sum + item.value, 0) / total : 0;
      return fraction > 0 ? <circle key={slice.name} cx="90" cy="90" r="61" pathLength="100" fill="none" stroke={slice.color} strokeWidth="27" strokeDasharray={`${fraction * 100} ${100 - fraction * 100}`} strokeDashoffset={-start * 100} transform="rotate(-90 90 90)"><title>{`${slice.name}: ${format(slice.value)}`}</title></circle> : null;
    })}
  </svg><div><strong>{center}</strong><span>{subtitle}</span></div></div>;
}

function RevenueChart({ points, usd }: { points: { date: string; value: number }[]; usd: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const bottom = 200;
  const minimum = Math.min(0, ...points.map(point => point.value));
  const maximum = Math.max(1, ...points.map(point => point.value));
  const baseline = bottom - (0 - minimum) / (maximum - minimum) * 175;
  const firstDate = Date.parse(points[0]?.date ?? "2000-01-01");
  const lastDate = Date.parse(points[points.length - 1]?.date ?? "2000-01-01");
  const coordinates = points.map(point => ({ ...point, x: 48 + (Date.parse(point.date) - firstDate) / Math.max(1, lastDate - firstDate) * 930, y: bottom - (point.value - minimum) / (maximum - minimum) * 175 }));
  const line = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const last = coordinates[coordinates.length - 1];
  const active = hovered === null ? undefined : coordinates[hovered];
  const formatDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const labels = coordinates.length > 4 ? [coordinates[0], coordinates[Math.floor(coordinates.length / 3)], coordinates[Math.floor(coordinates.length * 2 / 3)], last] : coordinates;
  return <div className={styles.chartWrap}><div className={styles.chartLegend}><i />{usd ? "Revenue (USD)" : "Revenue (source units)"}<span aria-live="polite">{active ? `${formatDate(active.date)} · ${currency(active.value, usd)}` : "Select a point to inspect its value"}</span></div>
    <svg className={styles.revenueChart} viewBox="0 0 1000 240" role="group" aria-label={`Cumulative revenue across ${points.length} recorded dates. ${usd ? "US dollars." : "Source units."}`} onMouseLeave={() => setHovered(null)}>
      <defs><linearGradient id="overview-revenue-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f6a57c" stopOpacity=".32" /><stop offset="100%" stopColor="#f6a57c" stopOpacity=".025" /></linearGradient></defs>
      {[25, 83, 142, 200].map(y => <line key={y} x1="48" y1={y} x2="978" y2={y} stroke="#eceff2" />)}
      <text x="38" y="29" textAnchor="end" fill="#6b7280" fontSize="12">{number(maximum)}</text><text x="38" y="204" textAnchor="end" fill="#6b7280" fontSize="12">{number(minimum)}</text>
      {last && <path d={`${line} L${last.x},${baseline} L48,${baseline} Z`} fill="url(#overview-revenue-area)" />}
      <path d={line} fill="none" stroke="#ed936c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {active && <><line x1={active.x} x2={active.x} y1={active.y} y2={bottom} stroke="#c88c72" strokeOpacity=".5" strokeDasharray="4 4" /><circle cx={active.x} cy={active.y} r="5" fill="#f47e54" stroke="#fff" strokeWidth="2" /></>}
      {coordinates.map((point, index) => <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r="11" fill="transparent" tabIndex={0} role="button" aria-label={`${formatDate(point.date)} cumulative revenue ${currency(point.value, usd)}`} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setHovered(index); } }}><title>{`${formatDate(point.date)} · ${currency(point.value, usd)}`}</title></circle>)}
      {labels.map((point, index) => <text key={`${point.date}-${index}`} x={point.x} y="230" textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"} fill="#6b7280" fontSize="12" fontFamily="inherit">{formatDate(point.date)}</text>)}
    </svg>
  </div>;
}

export default function Overview() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [range, setRange] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    api<Dataset[]>("/datasets").then(items => {
      if (cancelled) return;
      setDatasets(items);
      let saved: string[] = [];
      try { const parsed: unknown = JSON.parse(sessionStorage.getItem("selected-datasets") ?? "[]"); if (Array.isArray(parsed)) saved = parsed.filter((id): id is string => typeof id === "string"); } catch { /* An old selection should not block the workspace. */ }
      setSelected(items.find(item => saved.includes(item.id))?.id ?? items.find(item => item.display_name === "analysis_flat.csv")?.id ?? items[0]?.id ?? "");
      setLoading(false);
    }).catch(cause => {
      if (cancelled) return;
      if (cause instanceof ApiError && cause.status === 401) { clearPrivateState(); router.replace("/login"); }
      else { setError("Your sources could not be loaded. Refresh to try again."); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [router]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    api<Preview>(`/datasets/${selected}/preview`).then(result => { if (!cancelled) setPreview(result); }).catch(() => { if (!cancelled) setError("This source preview could not be loaded. You can still inspect it in Datasets."); });
    return () => { cancelled = true; };
  }, [selected]);
  const source = datasets.find(item => item.id === selected);
  const snapshot = useMemo(() => {
    if (!source) return null;
    const columns = source.profile.columns;
    const revenue = columns.find(column => /^(revenue|revenue_usd|sales_amount|total_revenue)$/i.test(column.name));
    const date = columns.find(column => /^(sale_date|order_date|transaction_date|date)$/i.test(column.name));
    const region = columns.find(column => /^(region|territory)$/i.test(column.name));
    const complete = Boolean(preview && !preview.truncated && preview.returned_rows >= preview.total_rows && preview.rows.length >= source.profile.row_count && preview.total_rows === source.profile.row_count);
    const datesValid = Boolean(date && complete && preview?.rows.every(row => typeof row[date.id] === "string" && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(String(row[date.id])) && Number.isFinite(Date.parse(String(row[date.id])))));
    const revenueValid = Boolean(revenue && complete && preview?.rows.every(row => numeric(row[revenue.id]) !== null));
    const months = datesValid && date ? [...new Set(preview!.rows.map(row => String(row[date.id]).slice(0, 7)))].sort() : [];
    const rows = preview?.rows.filter(row => range === "all" || !datesValid || !date || String(row[date.id]).slice(0, 7) === range) ?? [];
    const sum = revenueValid && revenue ? rows.reduce((total, row) => total + numeric(row[revenue.id])!, 0) : 0;
    const monthly = revenueValid && datesValid && revenue && date ? months.map(month => ({ month, value: preview!.rows.filter(row => String(row[date.id]).startsWith(month)).reduce((total, row) => total + numeric(row[revenue.id])!, 0) })) : [];
    const groupedDates = new Map<string, number>();
    if (revenueValid && datesValid && revenue && date) rows.forEach(row => { const key = String(row[date.id]).slice(0, 10); groupedDates.set(key, (groupedDates.get(key) ?? 0) + numeric(row[revenue.id])!); });
    let running = 0;
    const points = [...groupedDates.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ date: key, value: running += value }));
    const groupedRegions = new Map<string, number>();
    if (revenueValid && revenue && region && rows.every(row => numeric(row[revenue.id])! >= 0 && row[region.id] !== null)) rows.forEach(row => { const key = String(row[region.id]); groupedRegions.set(key, (groupedRegions.get(key) ?? 0) + numeric(row[revenue.id])!); });
    const types = new Map<string, number>(); columns.forEach(column => types.set(column.type, (types.get(column.type) ?? 0) + 1));
    const regional = groupedRegions.size > 0 && sum > 0;
    const grouped = [...(regional ? groupedRegions : types).entries()].sort(([, a], [, b]) => b - a);
    const limited = grouped.length > 5 ? [...grouped.slice(0, 5), ["Other", grouped.slice(5).reduce((total, [, value]) => total + value, 0)] as [string, number]] : grouped;
    const slices = limited.map(([name, value], index) => ({ name, value, color: colors[index % colors.length] }));
    const cells = source.profile.row_count * source.profile.column_count;
    const missing = columns.reduce((total, column) => total + column.missing_count, 0);
    return { revenueValid, revenue, date, datesValid, months, monthly, rows, sum, points, regional, regionCount: groupedRegions.size, slices, grouped: grouped.length, complete, usd: /_usd$/i.test(revenue?.name ?? ""), missing, completeness: cells ? (1 - missing / cells) * 100 : 0 };
  }, [source, preview, range]);
  async function sample() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/sample_data/analysis_flat.csv");
      if (!response.ok) throw new Error("The included data could not be loaded.");
      const results = await uploadDatasets<{ status: string; error?: string }[]>([new File([await response.blob()], "analysis_flat.csv", { type: "text/csv" })], () => {});
      if (results.some(result => result.status === "rejected" || result.error)) throw new Error(results.find(result => result.error)?.error ?? "The included data could not be uploaded.");
      const items = await api<Dataset[]>("/datasets"); setDatasets(items); setPreview(null); setRange("all");
      setSelected(items.find(item => item.display_name === "analysis_flat.csv")?.id ?? items[0]?.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The included data could not be loaded."); }
    finally { setBusy(false); }
  }
  function analyze() { if (selected) sessionStorage.setItem("selected-datasets", JSON.stringify([selected])); router.push("/analyze"); }
  const sampleSource = source?.display_name === "analysis_flat.csv";
  const rangeLabel = range === "all" ? "All recorded dates" : monthName(range, true);
  const monthlyMinimum = Math.min(0, ...(snapshot?.monthly.map(month => month.value) ?? []));
  const monthlyMaximum = Math.max(1, ...(snapshot?.monthly.map(month => month.value) ?? []));
  const monthlyScale = monthlyMaximum - monthlyMinimum;
  const monthlyBaseline = -monthlyMinimum / monthlyScale * 100;
  const periods = snapshot && snapshot.revenueValid && snapshot.datesValid ? <select aria-label="Reporting period" value={range} onChange={event => setRange(event.target.value)}><option value="all">All recorded dates</option>{snapshot.months.map(month => <option value={month} key={month}>{monthName(month, true)}</option>)}</select> : null;
  return <main id="main" className={styles.overview}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>YOUR ANALYTICAL WORKSPACE</span><h1>Overview</h1><p>Your sources, recent work, and next steps in one place.</p></div><Link className={styles.uploadButton} href="/datasets"><Plus size={15} /> Add data</Link></div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    <section className={styles.workspaceMetrics} aria-label="Workspace source summary">{[
      { label: "Connected sources", value: datasets.length, icon: Database, detail: "CSV and Excel files" },
      { label: "Stored records", value: datasets.reduce((sum, item) => sum + item.profile.row_count, 0), icon: Table2, detail: "Across your source library" },
      { label: "Profiled fields", value: datasets.reduce((sum, item) => sum + item.profile.column_count, 0), icon: Layers3, detail: "Inferred column types" },
      { label: "Sources to review", value: datasets.filter(item => item.profile.warnings.length || item.profile.duplicate_row_count || item.profile.columns.some(column => column.missing_count)).length, icon: CheckCheck, detail: "Missing values, duplicates or warnings" },
    ].map(item => <div key={item.label}><span><item.icon size={14} />{item.label}</span><strong>{loading || (error && !datasets.length) ? "—" : number(item.value)}</strong><small>{item.detail}</small></div>)}</section>
    {loading ? <div className={styles.loading}><LoaderCircle size={22} className={styles.spinner} /><p>Loading your sources…</p></div> : !source || !snapshot ? <section className={styles.empty}><Database size={32} /><h2>Add your first data source</h2><p>Upload a CSV or Excel file to view its metrics, inspect data quality, and start an analysis.</p><div><Link className={styles.primaryButton} href="/datasets">Upload a dataset <ArrowUpRight size={15} /></Link><button onClick={() => void sample()} disabled={busy}>{busy && <LoaderCircle size={15} className={styles.spinner} />}{busy ? "Loading data…" : "Load included data"}</button></div><small>CSV and Excel files · Private workspace</small></section> : <>
      <div className={styles.sourceSectionHeading}><div><h2>Source snapshot</h2><p>Explore the profile and recorded values of a selected source.</p></div><Link href="/analyze" onClick={() => { if (selected) sessionStorage.setItem("selected-datasets", JSON.stringify([selected])); }}>New analysis<ArrowUpRight size={13} /></Link></div>
      <div className={styles.toolbar}><div className={styles.sourceSelect}><Database size={14} /><select value={selected} aria-label="Overview source" onChange={event => { setPreview(null); setRange("all"); setError(""); setSelected(event.target.value); }}>{datasets.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select><ChevronDown size={12} /></div><span className={styles.sourceBadge}>{sampleSource ? "Synthetic data" : "Uploaded source"}</span><span className={styles.periodLabel}>{snapshot.datesValid && snapshot.revenueValid ? rangeLabel : "Full source profile"}</span></div>
      <div className={styles.bento}>
        <section className={styles.card}><div className={styles.cardHeading}><h2>{snapshot.monthly.length ? "Monthly revenue" : "Source profile"}</h2><span title="Source-derived metrics"><CircleHelp size={14} /></span></div><p className={styles.cardSubtitle}>{snapshot.monthly.length ? "Recorded revenue by month" : "Field completeness from your source"}</p>
          {snapshot.monthly.length ? <><div className={styles.barChart} role="group" aria-label="Monthly source revenue. Select a month to filter the overview.">{monthlyMinimum < 0 && <i className={styles.zeroLine} style={{ bottom: `${monthlyBaseline}%` }} />}{snapshot.monthly.map((item, index) => <div key={item.month}><button type="button" aria-pressed={range === item.month} aria-label={`${monthName(item.month, true)} revenue ${currency(item.value, snapshot.usd)}. Filter by this month.`} title={`${monthName(item.month, true)}: ${currency(item.value, snapshot.usd)}`} style={{ position: "absolute", bottom: `${monthlyBaseline}%`, transform: item.value < 0 ? "translateY(100%)" : undefined, height: `${Math.max(.5, Math.abs(item.value) / monthlyScale * 100)}%`, background: colors[index % colors.length] }} onClick={() => setRange(range === item.month ? "all" : item.month)}><span className={styles.barValue} style={item.value < 0 ? { bottom: "auto", top: "calc(100% + 5px)" } : undefined}>{currency(item.value, snapshot.usd, true)}</span></button><span>{monthName(item.month)}{snapshot.months.some(month => month.slice(0, 4) !== item.month.slice(0, 4)) ? ` '${item.month.slice(2, 4)}` : ""}</span></div>)}</div><div className={styles.cardFoot}><strong>{currency(snapshot.sum, snapshot.usd)}</strong><span>{number(snapshot.rows.length)} records in view · {rangeLabel}</span></div></> : <><div className={styles.schemaBars}>{source.profile.columns.slice(0, 5).map(column => <div key={column.id}><span>{column.name}</span><div><i style={{ width: `${(1 - column.missing_rate) * 100}%` }} /></div><small>{((1 - column.missing_rate) * 100).toFixed(0)}%</small></div>)}</div><div className={styles.cardFoot}><strong>{number(source.profile.row_count)} records</strong><span>{source.profile.column_count} columns · Full source</span></div></>}
        </section>
        <section className={styles.card}><div className={styles.cardHeading}><h2>{snapshot.regional ? "Revenue by region" : "Schema composition"}</h2></div><p className={styles.cardSubtitle}>{snapshot.regional ? "Share of revenue in this view" : "Inferred source column types"}</p><Donut slices={snapshot.slices} center={number(snapshot.regional ? snapshot.regionCount : source.profile.column_count)} subtitle={snapshot.regional ? "Regions" : "Columns"} format={value => snapshot.regional ? currency(value, snapshot.usd) : number(value)} /><div className={styles.allocationLegend}>{snapshot.slices.map(slice => <div key={slice.name}><i style={{ background: slice.color }} /><span>{slice.name}</span><strong>{snapshot.regional ? `${(slice.value / snapshot.sum * 100).toFixed(1)}%` : slice.value}</strong></div>)}</div>{snapshot.grouped > 5 && <p className={styles.smallNote}>Smaller categories are grouped as Other.</p>}</section>
        <section className={styles.card}><div className={styles.cardHeading}><h2>Data completeness</h2></div><p className={styles.cardSubtitle}>Nonmissing values across the full source</p><div className={styles.radial}><svg viewBox="0 0 180 180" role="img" aria-label={`${snapshot.completeness.toFixed(1)} percent of source values are present`}><circle cx="90" cy="90" r="65" fill="none" stroke="#f1f3f5" strokeWidth="18" /><circle cx="90" cy="90" r="65" fill="none" stroke="#f49a70" strokeWidth="18" pathLength="100" strokeDasharray={`${snapshot.completeness} ${100 - snapshot.completeness}`} transform="rotate(-90 90 90)" /></svg><div><strong>{snapshot.completeness.toFixed(snapshot.completeness === 100 ? 0 : 1)}%</strong><span>Complete values</span></div></div><div className={styles.qualityFoot}><CheckCheck size={15} /><span>{number(source.profile.row_count)} rows · {source.profile.column_count} columns<br />{snapshot.missing === 0 ? "No missing values in the source." : `${number(snapshot.missing)} missing cells in the source.`}</span></div></section>
        <section className={`${styles.card} ${styles.areaCard}`}><div className={styles.areaHeading}><div><h2>{snapshot.points.length ? "Revenue over time" : "Source details"}</h2><p>{snapshot.points.length ? "Cumulative recorded revenue" : "Profiled fields available for analysis"}</p></div>{periods}</div>{snapshot.points.length > 0 ? <RevenueChart key={`${selected}-${range}`} points={snapshot.points} usd={snapshot.usd} /> : <div className={styles.sourceDetails}>{!preview ? <p>Loading source preview…</p> : !snapshot.complete ? <p>This preview contains {preview.returned_rows} of {preview.total_rows} rows. Revenue summaries require the complete source and are unavailable for this preview.</p> : <p>A revenue chart requires an explicit revenue field and a supported ISO date column. Your source profile is available below.</p>}<div>{source.profile.columns.map(column => <span key={column.id}><strong>{column.name}</strong><small>{column.type}</small></span>)}</div></div>}<div className={styles.areaFoot}><span>{source.display_name}</span><span>{sampleSource ? "Synthetic data · " : ""}{snapshot.points.length ? snapshot.usd ? "USD · Source snapshot" : "Source units · Source snapshot" : "Full source profile"}</span></div></section>
      </div>
      <section className={styles.sourceCard}><div className={styles.sourceRow}><span className={styles.fileIcon}><FileSpreadsheet size={22} /></span><div className={styles.fileName}><strong>{source.display_name}</strong><span>Version {source.version} · {sampleSource ? "Synthetic data" : "Uploaded dataset"}</span></div><div className={styles.sourceMeta}><span><Table2 size={14} />{number(source.profile.row_count)} rows</span><span><Layers3 size={14} />{source.profile.column_count} columns</span></div><Link href="/datasets">Inspect source <ArrowUpRight size={14} /></Link></div><div className={styles.sourceAction}><div><strong>Explore this source</strong><p>Ask questions and inspect the underlying calculations.</p></div><button onClick={analyze}>Ask your data <ArrowRight size={15} /></button></div></section>
      <div className={styles.methodNote}><span><CheckCheck size={13} />{sampleSource ? "Synthetic included source" : "Private source snapshot"}</span><details><summary>How these metrics are calculated <CircleHelp size={13} /></summary><p>{snapshot.revenueValid ? `Revenue is the sum of ${snapshot.revenue?.name} across all ${snapshot.rows.length} source rows in this view. Monthly bars show each recorded month across the full source; selecting one filters the regional share, total and cumulative chart. ${snapshot.date && snapshot.datesValid ? `Dates use ${snapshot.date.name}. The chart shows a running total on a calendar date axis; dates with no records are omitted. ` : ""}${snapshot.usd ? "Amounts are in USD, as labeled by the source column. " : "Amounts use the source column’s units; no currency is assumed. "}` : "Record and column counts, missing cells and inferred types come from the full source profile. Revenue totals are only shown when every source row is available and the source contains an explicit revenue field. "}Completeness is the percentage of nonmissing cells across the entire source and is unaffected by period filters. {sampleSource ? "This included source contains synthetic data." : ""} These are descriptive source summaries, independent of AI analysis.</p></details></div>
    </>}
    {!loading && <><WorkspaceActivity /><WorkspaceJourney /></>}
  </main>;
}
