"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Database, Fingerprint, Layers3, ListFilter, LoaderCircle, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { count, decimal, money, useEvidence, type IssuesListResponse, type PatternsResponse, type Selection } from "./data";
import { EvidenceDialog } from "./evidence-dialog";
import styles from "./issues.module.css";

type Tab = "issues" | "patterns";
type Sort = "rank" | "high" | "open" | "title";
type Item = { kind: "issue" | "pattern"; id: string; title: string; reason: string; rank: number; high: number; open: number; count: number; lift: number; potential: number | null; labels: string[] };
const PAGE_SIZE = 8;

export default function IssuesPage() {
  const [tab, setTab] = useState<Tab>("issues");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("rank");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [trail, setTrail] = useState<Selection[]>([]);
  const issues = useEvidence<IssuesListResponse>("issues", attempt);
  const patterns = useEvidence<PatternsResponse>("patterns/priority", attempt);
  const active = tab === "issues" ? issues : patterns;
  const items = useMemo(() => {
    const rows: Item[] = tab === "issues" ? (issues.data?.issues ?? []).map(issue => ({ kind: "issue", id: issue.slug, title: issue.issue, reason: issue.whyItSurfaced, rank: issue.rank, high: issue.headline.high_rate_pct, open: issue.headline.open_events, count: issue.headline.event_count, lift: issue.headline.high_rate_lift, potential: issue.headline.potential_impact, labels: issue.triggeredSignals.map(signal => signal.label) }))
      : (patterns.data?.patterns ?? []).map((pattern, index) => ({ kind: "pattern", id: pattern.pattern_id, title: pattern.title, reason: pattern.why_seen, rank: index + 1, high: pattern.observed.high_rate_pct, open: pattern.observed.open_events, count: pattern.observed.event_count, lift: pattern.observed.high_rate_lift, potential: pattern.observed.potential_impact, labels: [pattern.priority_level + " priority", pattern.pattern_type.replaceAll('_', ' ')] }));
    const term = query.trim().toLocaleLowerCase();
    return rows.filter(item => !term || [item.id, item.title, item.reason, ...item.labels].some(value => value.toLocaleLowerCase().includes(term))).sort((a, b) => (sort === "high" ? b.high - a.high : sort === "open" ? b.open - a.open : sort === "title" ? a.title.localeCompare(b.title) : a.rank - b.rank) || a.rank - b.rank);
  }, [tab, issues.data, patterns.data, query, sort]);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const selection = trail[trail.length - 1];

  function switchTab(next: Tab) { setTab(next); setQuery(""); setSort("rank"); setPage(1); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "issues" : event.key === "End" ? "patterns" : tab === "issues" ? "patterns" : "issues";
    switchTab(next);
    document.getElementById(`evidence-tab-${next}`)?.focus();
  }

  return <main id="main" className={styles.page}>
    <div className={styles.breadcrumb}><span>Workspace</span><ChevronRight size={12} aria-hidden="true" /><span>Issues & patterns</span></div>
    <header className={styles.heading}><div><h1>Issues & patterns</h1><p>Understand what deserves attention, and follow the evidence.</p></div><button className={styles.secondaryButton} onClick={() => setAttempt(value => value + 1)} disabled={issues.loading || patterns.loading}><RefreshCw size={14} aria-hidden="true" />Refresh evidence</button></header>
    <div className={styles.metrics}>
      <div><span><ListFilter size={15} aria-hidden="true" />Ranked issues</span><strong>{issues.data ? count(issues.data.count) : "—"}</strong><small>Ordered by named signals</small></div>
      <div><span><Fingerprint size={15} aria-hidden="true" />Priority patterns</span><strong>{patterns.data ? count(patterns.data.count) : "—"}</strong><small>Existing backend priority queue</small></div>
      <div><span><ShieldCheck size={15} aria-hidden="true" />Evidence mode</span><strong className={styles.textMetric}>Deterministic</strong><small>Source facts · no AI request</small></div>
    </div>
    <div className={styles.sourceNotice}><Database size={15} aria-hidden="true" /><p>Synthetic issue and pattern source. This library has its own source scope; overview filters do not apply here.</p></div>
    <section className={styles.workspace} aria-label="Issue and pattern evidence">
      <div className={styles.tabs} role="tablist" aria-label="Evidence library">{(["issues", "patterns"] as const).map(value => <button key={value} role="tab" id={`evidence-tab-${value}`} aria-controls={`evidence-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => switchTab(value)} onKeyDown={tabKey}>{value === "issues" ? <ListFilter size={15} aria-hidden="true" /> : <Layers3 size={15} aria-hidden="true" />}{value === "issues" ? "Ranked issues" : "Priority patterns"}<span>{value === "issues" ? issues.data?.count ?? "—" : patterns.data?.count ?? "—"}</span></button>)}</div>
      <div role="tabpanel" id={`evidence-panel-${tab}`} aria-labelledby={`evidence-tab-${tab}`} tabIndex={0}>
        <div className={styles.panelHeading}><div><h2>{tab === "issues" ? "Where to focus your review" : "Patterns worth investigating"}</h2><p>{tab === "issues" ? "Ranked by transparent signals, with evidence both for and against concern." : "Stored pattern statistics and resolved source events from the priority queue."}</p></div></div>
        <div className={styles.toolbar}><label className={styles.search}><Search size={15} aria-hidden="true" /><input type="search" aria-label={tab === "issues" ? "Search ranked issues" : "Search priority patterns"} value={query} placeholder={tab === "issues" ? "Search issues or signals…" : "Search pattern title or source ID…"} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><label className={styles.sort}>Sort by<select value={sort} onChange={event => { setSort(event.target.value as Sort); setPage(1); }}><option value="rank">{tab === "issues" ? "Backend rank" : "Queue order"}</option><option value="high">High-severity rate</option><option value="open">Open event count</option><option value="title">Title</option></select></label></div>
        {active.loading ? <div className={styles.state} role="status"><LoaderCircle className={styles.spinner} size={22} aria-hidden="true" />Loading {tab === "issues" ? "ranked issues" : "priority patterns"}…</div> : active.error ? <div className={styles.state} role="alert"><h3>Evidence could not be loaded</h3><p>{active.error}</p><button onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />Retry connection</button></div> : !items.length ? <div className={styles.state}><Search size={24} aria-hidden="true" /><h3>{query ? "No matches for this search" : "No evidence in this queue"}</h3><p>{query ? "Try another title, source ID, or signal." : "The backend returned an empty list."}</p>{query && <button onClick={() => { setQuery(""); setPage(1); }}>Clear search</button>}</div> : <div className={styles.cards}>{items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map(item => <article key={item.id} className={styles.card}>
          <div className={styles.cardTop}><span className={styles.rank}>{tab === "issues" ? "Rank" : "Queue"} {item.rank}</span><span>{tab === "issues" ? "Computed issue signals" : item.id}</span></div>
          <h3>{item.title}</h3><p className={styles.reason}>{item.reason}</p><div className={styles.tags}>{item.labels.slice(0, 3).map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}{item.labels.length > 3 && <span>+{item.labels.length - 3} signals</span>}</div>
          <dl className={styles.cardMetrics}><div><dt>High-severity rate</dt><dd>{decimal(item.high)}%<small>{decimal(item.lift, 2)}× baseline</small></dd></div><div><dt>Open events</dt><dd>{count(item.open)}<small>{count(item.count)} matching records</small></dd></div></dl>
          <div className={styles.cardFooter}><span>Potential impact<strong>{money(item.potential)}</strong></span><button onClick={() => setTrail([{ kind: item.kind, id: item.id }])} aria-label={`Inspect evidence for ${item.title}`}>Inspect evidence<ArrowRight size={13} aria-hidden="true" /></button></div>
        </article>)}</div>}
        {!active.loading && !active.error && items.length > 0 && <div className={styles.listFooter}><span aria-live="polite">{(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, items.length)} of {count(items.length)} {query ? "matching " : ""}{tab === "issues" ? "issues" : "patterns"}</span><div className={styles.pagination}><button aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)}><ChevronLeft size={14} aria-hidden="true" /></button><span>Page {current} of {pageCount}</span><button aria-label="Next page" disabled={current === pageCount} onClick={() => setPage(current + 1)}><ChevronRight size={14} aria-hidden="true" /></button></div></div>}
      </div>
    </section>
    <footer className={styles.pageFooter}><ShieldCheck size={12} aria-hidden="true" /><span>Issues and patterns may share events. Their counts are not additive. Source records remain unchanged.</span></footer>
    {selection && <EvidenceDialog selection={selection} canGoBack={trail.length > 1} open={next => setTrail(previous => [...previous, next])} back={() => setTrail(previous => previous.slice(0, -1))} close={() => setTrail([])} />}
  </main>;
}
