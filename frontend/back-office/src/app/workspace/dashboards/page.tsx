"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, BarChart3, Check, ChevronRight, CircleAlert, Database, Download, LayoutDashboard, LoaderCircle, RefreshCw, SlidersHorizontal, SquareChartGantt } from "lucide-react";
import { AnalysisEvidence } from "@/components/analysis-evidence";
import base from "../../dashboards/dashboards.module.css";
import styles from "./dashboards.module.css";
import { dashboardCards, initialFilters, money, number, percent, type DashboardView, type Filters, type Metadata, type Overview } from "./dashboard-data";

const layouts: { title: string; description: string; kind: string; view: DashboardView; icon: typeof LayoutDashboard }[] = [
  { title: "Business overview", description: "Bring event counts, exposure, and the largest concentrations into one view.", kind: "overview", view: "overview", icon: LayoutDashboard },
  { title: "Exposure & impact", description: "Compare realised loss, recoveries, and potential impact across your scope.", kind: "trend", view: "exposure", icon: BarChart3 },
  { title: "Workflow & backlog", description: "Understand open work, current status, and high-severity concentrations.", kind: "category", view: "workflow", icon: SquareChartGantt },
];

type LoadState = { key: string; data?: Overview; error?: string; fetchedAt?: string };
async function readJson<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  if (!response.ok) throw new Error(`The analysis service returned ${response.status}. Please try again.`);
  return response.json() as Promise<T>;
}

export default function OperationalDashboards() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [draft, setDraft] = useState<Filters>(initialFilters);
  const [view, setView] = useState<DashboardView>("overview");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ key: "" });
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [metadataError, setMetadataError] = useState(false);
  const [dateError, setDateError] = useState("");
  const requestBody = JSON.stringify({ filters });
  const requestKey = `${requestBody}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    readJson<Metadata>("/api/operational/metadata", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setMetadata(value); setMetadataError(false); } })
      .catch(() => { if (!controller.signal.aborted) setMetadataError(true); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const controller = new AbortController();
    readJson<Overview>("/api/operational/overview", { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ key: requestKey, data, fetchedAt: new Date().toISOString() }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setState({ key: requestKey, error: error instanceof Error ? error.message : "Unable to load this scope." }); });
    return () => controller.abort();
  }, [requestBody, requestKey]);

  const current = state.key === requestKey;
  const data = current ? state.data : undefined;
  const error = current ? state.error : undefined;
  const loading = !current;
  const cards = useMemo(() => data ? dashboardCards(data, view) : [], [data, view]);
  const activeLayout = layouts.find(layout => layout.view === view)!;
  const organisations = Array.from(new Set(["Enterprise-wide", ...(metadata?.organisations ?? [])]));

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = draft.dateFrom || metadata?.dateRange.min;
    const to = draft.dateTo || metadata?.dateRange.max;
    if (from && to && from > to) { setDateError("Choose an end date on or after the start date."); return; }
    setDateError("");
    setFilters({ ...draft, dateFrom: draft.dateFrom || undefined, dateTo: draft.dateTo || undefined });
  }

  function downloadSnapshot() {
    if (!data) return;
    const snapshot = { title: activeLayout.title, source: "Canonical synthetic operational records", computedBy: "Existing overview API", fetchedAt: state.fetchedAt, overview: data };
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "signal-dashboard-snapshot.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main id="main" className={`content ${base.page} ${styles.page}`}>
    <div className={base.breadcrumb}><span>Workspace</span><ChevronRight size={13} aria-hidden="true" /><span>Dashboards</span></div>
    <header className={base.heading}>
      <div><h1>Dashboards</h1><p>Explore the numbers behind your operational data.</p></div>
      <div className={base.headingActions}><a href="/workspace/investigate" className={base.previewLink}>Explore details<ArrowUpRight size={14} aria-hidden="true" /></a><button className={base.primaryButton} onClick={downloadSnapshot} disabled={!data}><Download size={15} aria-hidden="true" />Download data</button></div>
    </header>

    <div className={base.metrics} aria-label="Current population summary" aria-busy={loading}>
      <div className={base.metricCard}><span className={base.metricLabel}><Database size={16} aria-hidden="true" />Events in scope</span><div className={base.metricBottom}><strong>{data ? number(data.eventCount) : "—"}</strong><span>{data ? `${number(data.datasetEventCount)} source records` : "Canonical records"}</span></div></div>
      <div className={base.metricCard}><span className={base.metricLabel}><BarChart3 size={16} aria-hidden="true" />Net exposure</span><div className={base.metricBottom}><strong className={styles.money}>{data ? money(data.exposure.realised.netAmountUsd) : "—"}</strong><span>Realised · USD</span></div></div>
      <div className={base.metricCard}><span className={base.metricLabel}><SquareChartGantt size={16} aria-hidden="true" />Open backlog</span><div className={base.metricBottom}><strong>{data ? number(data.composition.workflow.open) : "—"}</strong><span>{data ? `${percent(data.composition.workflow.open, data.eventCount)} of scope` : "Excludes closed & cancelled"}</span></div></div>
    </div>

    <section className={base.layouts} aria-labelledby="dashboard-layout-title"><div className={base.layoutHeading}><div><span>BUILT AROUND YOUR DATA</span><h2 id="dashboard-layout-title">Choose a starting point.</h2><p>Switch your perspective. Every view uses the same filtered records.</p></div><span>Four computed cards</span></div><div className={base.layoutGrid}>{layouts.map(item => <button key={item.view} aria-pressed={view === item.view} onClick={() => setView(item.view)}><div className={base.layoutPreview} aria-hidden="true" data-kind={item.kind}><span /><span /><span /><span /><span /><i>Layout preview</i></div><div className={base.layoutTitle}><item.icon size={15} aria-hidden="true" /><h3>{item.title}</h3><ArrowUpRight size={14} aria-hidden="true" /></div><p>{item.description}</p><span className={base.layoutAction}>{view === item.view ? "Selected view" : "Explore this view"}<ArrowRight size={12} aria-hidden="true" /></span></button>)}</div></section>

    <div className={`${base.workGrid} ${styles.workGrid}`}>
      <section className={base.library} aria-labelledby="computed-heading" aria-busy={loading}>
        <div className={base.sectionHeading}><div><h2 id="computed-heading">{activeLayout.title}<span>{data && data.eventCount > 0 ? cards.length : "—"}</span></h2><p>{data ? `${data.filters.dateFrom} to ${data.filters.dateTo} · ${data.filters.organisation}` : "Calculations from the existing analysis service."}</p></div><button className={styles.iconButton} onClick={() => setAttempt(value => value + 1)} aria-label="Refresh dashboard" disabled={loading}><RefreshCw size={16} aria-hidden="true" /></button></div>
        {loading ? <div className={base.loading} role="status"><LoaderCircle size={22} className={base.spinner} aria-hidden="true" /><p>Computing your dashboard…</p></div>
          : error ? <div className={base.errorState} role="alert"><CircleAlert size={25} aria-hidden="true" /><h3>Unable to load this scope</h3><p>{error}</p><button className={base.secondaryButton} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />Try again</button></div>
          : data?.eventCount === 0 ? <div className={base.emptyState}><Database size={27} aria-hidden="true" /><h3>No events match these filters</h3><p>Broaden the date range or choose another organisation to explore its records.</p><button className={base.secondaryButton} onClick={() => { setDraft(initialFilters); setFilters(initialFilters); setDateError(""); }}>Reset filters</button></div>
          : <div className={styles.cardGrid}>{cards.map(card => <article key={card.id} className={styles.chartCard}><div className={styles.cardHeading}><span><Check size={12} aria-hidden="true" />Computed from records</span><BarChart3 size={15} aria-hidden="true" /></div><h3>{card.title}</h3><p>{card.description}</p><AnalysisEvidence table={card.table} charts={card.charts} /><details><summary>How this is calculated</summary><p>{card.method}</p></details></article>)}</div>}
      </section>

      <aside className={base.builderColumn}>
        <section className={base.builder} aria-labelledby="scope-heading"><h2 id="scope-heading"><SlidersHorizontal size={15} aria-hidden="true" />Dashboard scope</h2><p className={base.builderDescription}>Choose which records contribute to every metric and chart.</p>
          <form className={styles.scopeForm} onSubmit={applyFilters}>
            <label>Organisation<select value={draft.organisation} onChange={event => setDraft(value => ({ ...value, organisation: event.target.value }))}>{organisations.map(org => <option key={org} value={org}>{org}</option>)}</select></label>
            {metadataError && <p className={styles.formMessage}>Organisation options could not load. <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry connection</button></p>}
            <label>Event type<select value={draft.eventType} onChange={event => setDraft(value => ({ ...value, eventType: event.target.value as Filters["eventType"] }))}>{["All", "Financial", "Non-Financial"].map(option => <option key={option}>{option}</option>)}</select></label>
            <label>Severity<select value={draft.severity} onChange={event => setDraft(value => ({ ...value, severity: event.target.value as Filters["severity"] }))}>{["All", "Low", "Moderate", "High"].map(option => <option key={option}>{option}</option>)}</select></label>
            <div className={styles.dates}><label>From<input type="date" value={draft.dateFrom ?? ""} min={metadata?.dateRange.min} max={draft.dateTo || metadata?.dateRange.max} onChange={event => setDraft(value => ({ ...value, dateFrom: event.target.value }))} /></label><label>To<input type="date" value={draft.dateTo ?? ""} min={draft.dateFrom || metadata?.dateRange.min} max={metadata?.dateRange.max} onChange={event => setDraft(value => ({ ...value, dateTo: event.target.value }))} /></label></div>
            <p className={styles.dateHint}>Leave dates blank to use the full source period.</p>
            {dateError && <p className={styles.formMessage} role="alert">{dateError}</p>}
            <button className={base.secondaryButton} type="submit">Apply scope<ArrowRight size={13} aria-hidden="true" /></button>
            <button className={styles.reset} type="button" onClick={() => { setDraft(initialFilters); setFilters(initialFilters); setDateError(""); }}>Reset all filters</button>
          </form>
        </section>
        <div className={base.contextNote}><span className={base.contextIcon}><Database size={16} aria-hidden="true" /></span><div><strong>One source, consistent results</strong><p>Metrics are calculated by the existing backend from synthetic operational records. Charts reflect the applied scope.</p><a href="/workspace/investigate">Open detailed analysis<ArrowUpRight size={12} aria-hidden="true" /></a></div></div>
        {data && <div className={styles.scopeNotes}><span>IN THIS SCOPE</span><p><strong>{number(data.composition.workflow.highStillOpen)}</strong> high-severity events remain open.</p><p><strong>{number(data.exposure.operational.totalRemediationHours)} hours</strong> of recorded remediation effort.</p><p><strong>{money(data.exposure.potential.totalUsd)}</strong> potential impact, measured separately from realised exposure.</p></div>}
      </aside>
    </div>
    <footer className={base.pageFooter}><span><span />Computed on request · Synthetic source data</span><span>Downloads are local snapshots of these results.</span></footer>
  </main>;
}
