"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, ArrowUpDown, BarChart3, Battery, Check, ChevronDown, Database, FileSpreadsheet, Home, Maximize2, Search, Users, Wifi, X } from "lucide-react";
import type { LiveDashboardRow } from "./live-dashboard";
import styles from "./live-feature-previews.module.css";

type Props = { rows: readonly LiveDashboardRow[]; columnCount?: number };
type SortKey = keyof LiveDashboardRow;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const shortDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fields: { key: SortKey; label: string }[] = [{ key: "date", label: "Date" }, { key: "customer", label: "Customer" }, { key: "region", label: "Region" }, { key: "revenue", label: "Revenue" }];
function total(rows: readonly LiveDashboardRow[]) { return rows.reduce((sum, row) => sum + row.revenue, 0); }
function customers(rows: readonly LiveDashboardRow[]) { return new Set(rows.map(row => row.customer)).size; }
function csvCell(value: string | number) {
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function downloadCsv(rows: readonly LiveDashboardRow[], filename: string) {
  const content = ["sale_date,customer_id,region,revenue_usd", ...rows.map(row => [row.date, row.customer, row.region, row.revenue].map(csvCell).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function SampleTable({ rows, sort, ascending, onSort, compact = true }: { rows: readonly LiveDashboardRow[]; sort?: SortKey; ascending?: boolean; onSort?: (key: SortKey) => void; compact?: boolean }) {
  return <div className={`${styles.tableScroll} ${compact ? styles.compact : ""}`} tabIndex={0} aria-label="Scrollable source records"><table><caption className={styles.srOnly}>Included synthetic sales records. Revenue is in US dollars.</caption><thead><tr>{fields.map(field => <th key={field.key} aria-sort={sort === field.key ? ascending ? "ascending" : "descending" : undefined}>{onSort ? <button onClick={() => onSort(field.key)} aria-label={`Sort by ${field.label}${sort === field.key ? ascending ? ", currently ascending" : ", currently descending" : ""}`}>{field.label}<ArrowUpDown size={10} /></button> : field.label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${row.date}-${row.customer}-${index}`}><td>{shortDate(row.date)}</td><td title={row.customer}>{row.customer}</td><td title={row.region}>{row.region}</td><td>{money(row.revenue)}</td></tr>) : <tr><td colSpan={4} className={styles.emptyCell}>No matching records.</td></tr>}</tbody></table></div>;
}

export function SourcePreview({ rows, columnCount = 4 }: Props) {
  const id = useId();
  const [tab, setTab] = useState<"preview" | "profile">("preview");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [ascending, setAscending] = useState(true);
  const [status, setStatus] = useState("");
  const filtered = useMemo(() => rows.filter(row => [row.date, row.customer, row.region, String(row.revenue)].some(value => value.toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => {
    const left = a[sort]; const right = b[sort];
    const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return comparison * (ascending ? 1 : -1);
  }), [rows, query, sort, ascending]);
  function changeSort(key: SortKey) { if (sort === key) setAscending(value => !value); else { setSort(key); setAscending(true); } }
  function chooseTab(next: "preview" | "profile") { setTab(next); setStatus(""); }
  return <section className={styles.sourcePreview} aria-label="Interactive source preview">
    <header className={styles.sourceHeader}><FileSpreadsheet size={15} /><strong>analysis_flat.csv</strong><span>Included data</span><Link href="/workspace/datasets" aria-label="Open data sources"><ArrowUpRight size={13} /></Link></header>
    <div className={styles.tabs} role="tablist" aria-label="Source preview view">{(["preview", "profile"] as const).map(value => <button role="tab" id={`${id}-${value}-tab`} aria-selected={tab === value} aria-controls={`${id}-${value}-panel`} tabIndex={tab === value ? 0 : -1} key={value} onClick={() => chooseTab(value)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "preview" : event.key === "End" ? "profile" : tab === "preview" ? "profile" : "preview"; chooseTab(next); document.getElementById(`${id}-${next}-tab`)?.focus(); } }}>{value === "preview" ? "Preview" : "Profile"}</button>)}</div>
    {tab === "preview" ? <div id={`${id}-preview-panel`} role="tabpanel" aria-labelledby={`${id}-preview-tab`} className={styles.sourcePanel}><label className={styles.search}><Search size={12} /><input aria-label="Search records" value={query} onChange={event => { setQuery(event.target.value); setStatus(""); }} placeholder="Search records…" />{query && <button onClick={() => setQuery("")} aria-label="Clear record search"><X size={11} /></button>}</label><SampleTable rows={filtered} sort={sort} ascending={ascending} onSort={changeSort} /></div> : <div id={`${id}-profile-panel`} role="tabpanel" aria-labelledby={`${id}-profile-tab`} className={styles.profilePanel}><div><span>Source records</span><strong>{rows.length}</strong></div><div><span>Source columns</span><strong>{columnCount}</strong></div><div><span>Distinct customers</span><strong>{customers(rows)}</strong></div><div><span>Recorded revenue</span><strong>{money(total(rows))}</strong></div><p><Check size={12} />Figures calculated from the included data.</p></div>}
    <footer className={styles.sourceFooter}><span role="status">{status || `${tab === "preview" ? filtered.length : rows.length} records · 4 displayed fields`}</span><button disabled={!(tab === "preview" ? filtered : rows).length} onClick={() => { downloadCsv(tab === "preview" ? filtered : rows, "source-preview.csv"); setStatus("CSV prepared"); }}><ArrowDownToLine size={11} />Export CSV</button></footer>
  </section>;
}

function MobileContent({ rows, period, onPeriod, tab, onTab }: { rows: readonly LiveDashboardRow[]; period: string; onPeriod: (value: string) => void; tab: "summary" | "customers"; onTab: (value: "summary" | "customers") => void }) {
  const months = [...new Set(rows.map(row => row.date.slice(0, 7)))].sort();
  const selected = rows.filter(row => period === "all" || row.date.startsWith(period));
  const monthly = (period === "all" ? months : [period]).map(month => ({ month, value: total(selected.filter(row => row.date.startsWith(month))) }));
  const customerRows = [...new Set(selected.map(row => row.customer))].map(customer => ({ customer, value: total(selected.filter(row => row.customer === customer)) })).sort((a, b) => b.value - a.value);
  const maximum = Math.max(1, ...monthly.map(month => Math.abs(month.value)));
  return <div className={styles.mobileApp}><div className={styles.mobileBrand}><span><BarChart3 size={17} /></span><strong>DataLens</strong><span className={styles.sampleDot} title="Included synthetic data" /></div><div className={styles.mobileHeading}><h4>Overview</h4><select value={period} onChange={event => onPeriod(event.target.value)} aria-label="Mobile reporting period"><option value="all">All dates</option>{months.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></div><div className={styles.mobileTabs} aria-label="Mobile overview view"><button aria-pressed={tab === "summary"} onClick={() => onTab("summary")}>Summary</button><button aria-pressed={tab === "customers"} onClick={() => onTab("customers")}>Customers</button></div>
    {tab === "summary" ? <div className={styles.mobileSummary}><div className={styles.mobileTotal}><span>Recorded revenue</span><strong>{money(total(selected))}</strong><small>{selected.length} transactions in view</small></div><div className={styles.mobileChart}><h5>Revenue by month</h5>{monthly.length ? <div>{monthly.map((month, index) => <div key={month.month}><button title={`${monthLabel(month.month)}: ${money(month.value)}`} aria-label={`${monthLabel(month.month)} revenue ${money(month.value)}. Select month.`} aria-pressed={period === month.month} onClick={() => onPeriod(period === month.month ? "all" : month.month)} style={{ height: `${Math.max(1, Math.abs(month.value) / maximum * 100)}%`, opacity: 1 - index * .2 }} /><span>{monthLabel(month.month).split(" ")[0]}</span></div>)}</div> : <p>No source records available.</p>}</div><div className={styles.mobileStats}><div><Users size={14} /><span>Customers<strong>{customers(selected)}</strong></span></div><div><Database size={14} /><span>Records<strong>{selected.length}</strong></span></div></div></div> : <div className={styles.mobileCustomers}><div className={styles.customerListHeading}><span>Customer</span><span>Revenue · USD</span></div>{customerRows.length ? customerRows.map((item, index) => <div key={item.customer}><span className={styles.customerAvatar}>{index + 1}</span><strong title={item.customer}>{item.customer}</strong><span>{money(item.value)}</span></div>) : <p>No customers in this view.</p>}</div>}
    <div className={styles.mobileBottom}><button aria-label="Show mobile summary" aria-pressed={tab === "summary"} onClick={() => onTab("summary")}><Home size={17} /><span>Overview</span></button><button aria-label="Show mobile customers" aria-pressed={tab === "customers"} onClick={() => onTab("customers")}><Users size={17} /><span>Customers</span></button><Link href="/workspace/datasets"><Database size={17} /><span>Sources</span></Link></div>
  </div>;
}

export function MobilePreview({ rows }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [period, setPeriod] = useState("all");
  const [tab, setTab] = useState<"summary" | "customers">("summary");
  const [status, setStatus] = useState("");
  const selected = rows.filter(row => period === "all" || row.date.startsWith(period));
  function exportRows() { downloadCsv(selected, "mobile-view.csv"); setStatus("CSV prepared for the selected period."); }
  return <div className={styles.mobilePreview}>
    <div className={styles.phone}><div className={styles.phoneStatus} aria-hidden="true"><span>Preview</span><i /><span><Wifi size={11} /><Battery size={14} /></span></div><MobileContent rows={rows} period={period} onPeriod={setPeriod} tab={tab} onTab={setTab} /></div>
    <div className={styles.mobileActions}><button onClick={() => dialog.current?.showModal()}><Maximize2 size={12} />Open mobile view</button><button disabled={!selected.length} onClick={exportRows} aria-label="Download mobile view as CSV"><ArrowDownToLine size={13} />CSV</button></div><span className={styles.previewStatus} role="status">{status || "Live interface · Included synthetic data"}</span>
    <dialog ref={dialog} className={styles.mobileDialog} aria-label="Responsive mobile workspace" onClick={event => { if (event.currentTarget === event.target) dialog.current?.close(); }}><div className={styles.dialogHeader}><strong>Mobile workspace</strong><button onClick={() => dialog.current?.close()} aria-label="Close mobile workspace"><X size={17} /></button></div><MobileContent rows={rows} period={period} onPeriod={setPeriod} tab={tab} onTab={setTab} /><div className={styles.dialogFooter}><span>Included synthetic data · 4 exported fields</span><button disabled={!selected.length} onClick={exportRows}><ArrowDownToLine size={12} />Export CSV</button></div><p className={styles.dialogStatus} role="status">{status}</p></dialog>
  </div>;
}

export function BrowserPreview({ rows }: Props) {
  const [region, setRegion] = useState("all");
  const [compact, setCompact] = useState(true);
  const [status, setStatus] = useState("");
  const regions = [...new Set(rows.map(row => row.region))].sort();
  const selected = rows.filter(row => region === "all" || row.region === region);
  return <section className={styles.browserPreview} aria-label="Interactive browser workspace"><div className={styles.browserChrome}><div aria-hidden="true"><i /><i /><i /></div><span>DataLens / source explorer</span><Maximize2 size={11} aria-hidden="true" /></div><div className={styles.browserBody}><div className={styles.browserToolbar}><div><FileSpreadsheet size={15} /><strong>Source explorer</strong></div><label><span className={styles.srOnly}>Filter by region</span><select value={region} onChange={event => { setRegion(event.target.value); setStatus(""); }}><option value="all">All regions</option>{regions.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={11} /></label></div><div className={styles.browserMetrics}><div><span>Revenue · USD</span><strong>{money(total(selected))}</strong></div><div><span>Records</span><strong>{selected.length}</strong></div><div><span>Customers</span><strong>{customers(selected)}</strong></div></div><div className={styles.resultToolbar}><span>Source records</span><button aria-pressed={!compact} onClick={() => setCompact(value => !value)}>{compact ? "Compact" : "Comfortable"}<ArrowUpDown size={10} /></button></div><SampleTable rows={selected} compact={compact} /><div className={styles.browserFooter}><span role="status">{status || `${selected.length} records · 4 fields`}</span><button disabled={!selected.length} onClick={() => { downloadCsv(selected, "source-results.csv"); setStatus("CSV prepared"); }}><ArrowDownToLine size={11} />Export CSV</button><Link href="/workspace/analyze">Open analysis<ArrowRight size={12} /></Link></div></div></section>;
}
