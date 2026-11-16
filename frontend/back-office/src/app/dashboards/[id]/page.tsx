"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleAlert, Code2, Database, FileText, Layers3, LoaderCircle, RefreshCw } from "lucide-react";
import { api, ApiError, clearPrivateState } from "@/lib/api";
import { AnalysisEvidence, AnomalySummary, type Result, type Chart, type Anomalies } from "@/components/analysis-evidence";
import { ExportDialog } from "@/components/export-dialog";
import { EvidenceMethod } from "@/components/evidence-method";
import styles from "./saved.module.css";

type Evidence = { id: string; conversation_id?: string; answer: string; clarification?: string; error?: string; sql: string;
  table?: Result; charts: Chart[]; chart_error?: string; anomalies?: Anomalies; method: Record<string, unknown>;
  dataset_versions: { display_name: string; version: number }[] };
type Dashboard = { title: string; created_at: string; status: string; complete_cards: number; total_cards: number;
  dataset_versions: { display_name: string; version: number }[];
  cards: { title: string; status: string; error?: string; analysis_id?: string; evidence?: Evidence }[] };

function metric(table?: Result) {
  if (!table || table.truncated || table.rows.length !== 1 || table.columns.length !== 1) return null;
  const column = table.columns[0], value = table.rows[0][column];
  if (value === null || !/^(DECIMAL|DOUBLE|FLOAT|.*INT)/.test(table.types?.[column] ?? "") || !Number.isFinite(Number(value))) return null;
  return { label: column, value: String(value) };
}

export default function SavedDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("all");
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    let active = true;
    api<Dashboard>(`/dashboards/${id}`).then(saved => { if (active) setItem(saved); }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) { clearPrivateState(); router.replace("/login"); }
      else setError("This dashboard is unavailable. Check the connection or return to your library.");
    });
    return () => { active = false; };
  }, [id, attempt, router]);

  const conversation = item?.cards.find(card => card.evidence?.conversation_id)?.evidence?.conversation_id;
  const analyzeHref = conversation ? `/analyze?conversation=${encodeURIComponent(conversation)}` : "/analyze";
  const visibleCards = item?.cards.map((card, index) => ({ card, index })).filter(({ card }) => filter === "all" || (filter === "complete" ? card.status === "complete" : card.status !== "complete")) ?? [];
  return <main id="main" className={`content ${styles.page}`}>
    <div className={styles.breadcrumb}><Link href="/dashboards">Dashboards</Link><ChevronRight size={12} aria-hidden="true" /><span>Saved view</span></div>
    <Link href="/dashboards" className={styles.back}><ArrowLeft size={13} aria-hidden="true" />Back to library</Link>
    {error && <section className={styles.error} role="alert"><CircleAlert size={26} aria-hidden="true" /><h1>Dashboard unavailable</h1><p>{error}</p>
      <button onClick={() => { setError(""); setAttempt(value => value + 1); }}><RefreshCw size={14} aria-hidden="true" />Try again</button></section>}
    {!item && !error && <section className={styles.loading} role="status"><LoaderCircle className={styles.spinner} size={23} aria-hidden="true" /><p>Opening saved evidence…</p></section>}
    {item && <>
      <header className={styles.heading}>
        <div><div className={styles.headingEyebrow}><span>SAVED DASHBOARD</span><span className={`${styles.status} ${item.status === "complete" ? styles.complete : styles.review}`}><i />{item.status === "complete" ? "Complete" : "Needs review"}</span></div>
          <h1>{item.title}</h1><p><CalendarDays size={12} aria-hidden="true" />{new Date(item.created_at).toLocaleString()}<span className={styles.metaDot}>·</span>{item.complete_cards} of {item.total_cards} cards complete</p></div>
        <div className={styles.export}><ExportDialog choices={item.cards.map((card, index) => ({ id: card.analysis_id ?? `unavailable-${index}`, title: card.title, status: card.status,
          sources: card.evidence?.dataset_versions.map(source => `${source.display_name} v${source.version}`).join(", ") ?? "Source unavailable" }))} /></div>
      </header>
      <section className={styles.resultMetrics} aria-label="Saved dashboard summary"><div><span>Computed cards</span><strong>{item.complete_cards}<small> / {item.total_cards}</small></strong></div><div><span>Source versions</span><strong>{item.dataset_versions.length}</strong></div><div><span>Saved charts</span><strong>{item.cards.reduce((sum, card) => sum + (card.evidence?.charts?.length ?? 0), 0)}</strong></div><div><span>Result rows</span><strong>{item.cards.reduce((sum, card) => sum + (card.evidence?.table?.rows.length ?? 0), 0).toLocaleString()}</strong><small>In saved result tables</small></div></section>
      {copyStatus && <p className={styles.copyStatus} role="status">{copyStatus}</p>}
      <section className={styles.snapshot} aria-label="Dashboard source information">
        <span className={styles.snapshotIcon}><Layers3 size={17} aria-hidden="true" /></span><div><strong>Source information</strong><p>Values reflect the source versions used when this dashboard was created.</p>
          <div className={styles.sources}>{item.dataset_versions.map((source, index) => <span key={`${source.display_name}-${index}`}><Database size={10} aria-hidden="true" />{source.display_name}<em>v{source.version}</em></span>)}</div></div>
        <span className={styles.snapshotBadge}><Check size={11} aria-hidden="true" />Saved snapshot</span>
      </section>
      {item.status !== "complete" && <div className={styles.partialNotice}><CircleAlert size={16} aria-hidden="true" /><p>Some cards need attention. Your available evidence is preserved. Review clarifications in <Link href={analyzeHref}>Analyze</Link> or <Link href="/dashboards">create a new dashboard</Link> after resolving them.</p></div>}
      <div className={styles.sectionHeading}><h2>Dashboard cards<span>{item.total_cards} cards</span></h2><ChartNoAxesCombined size={16} aria-hidden="true" /></div>
      <div className={styles.cardFilters} aria-label="Filter dashboard cards">{["all", "complete", "review"].map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All cards" : value === "complete" ? "Computed" : "Needs attention"}</button>)}<Link href={analyzeHref}>Continue analysis<ArrowUpRight size={12} /></Link></div>
      {visibleCards.length > 1 && <nav className={styles.cardJump} aria-label="Jump to a dashboard card">{visibleCards.map(({ card, index }) => <a key={index} href={`#dashboard-card-${index + 1}`}><span>{String(index + 1).padStart(2, "0")}</span>{card.title}<ChevronRight size={12} aria-hidden="true" /></a>)}</nav>}
      {visibleCards.length === 0 && <div className={styles.noCards}><h3>{item.total_cards ? "No cards match this filter" : "No cards are available"}</h3><p>{item.total_cards ? "Choose another status to explore the saved results." : "Open Analyze to review the source context and prepare a new dashboard."}</p>{item.total_cards ? <button onClick={() => setFilter("all")}>Show all cards</button> : <Link href={analyzeHref}>Open Analyze<ArrowUpRight size={12} /></Link>}</div>}
      <div className={styles.grid}>{visibleCards.map(({ card, index }) => {
        const evidence = card.evidence, value = metric(evidence?.table);
        const asymmetric = item.cards.length === 2;
        return <article id={`dashboard-card-${index + 1}`} className={`${styles.card} ${asymmetric ? value ? styles.metricCard : styles.chartCard : ""}`} key={index}>
          <div className={styles.cardHeading}><span className={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</span><span className={`${styles.status} ${card.status === "complete" ? styles.complete : styles.review}`}><i />{card.status === "complete" ? "Computed" : "Needs review"}</span></div>
          <h3>{card.title}</h3>
          {value && <div className={styles.metric}><strong title={value.value}>{value.value}</strong><span>{value.label.replaceAll("_", " ")}</span></div>}
          <p className={styles.answer}>{card.error ?? evidence?.answer ?? evidence?.clarification ?? evidence?.error}</p>
          {evidence?.chart_error && <p className={styles.chartError}>{evidence.chart_error}</p>}
          {evidence?.table && <div className={styles.evidence}><AnalysisEvidence table={evidence.table} charts={evidence.charts} interactive /></div>}
          {evidence?.anomalies && <AnomalySummary value={evidence.anomalies} />}
          {evidence && <div className={styles.evidenceDetails}>
            <p className={styles.cardSources}><Database size={11} aria-hidden="true" /><span>{evidence.dataset_versions.map(source => `${source.display_name} v${source.version}`).join(", ")}</span></p>
            <details><summary><FileText size={13} aria-hidden="true" />Method, assumptions &amp; joins</summary><EvidenceMethod method={evidence.method} /></details>
            <details><summary><Code2 size={13} aria-hidden="true" />Executed SQL</summary><pre>{evidence.sql ?? "No query executed."}</pre>{evidence.sql && <button className={styles.copyQuery} onClick={() => { void navigator.clipboard.writeText(evidence.sql).then(() => setCopyStatus("SQL copied to clipboard.")).catch(() => setCopyStatus("Copy unavailable. Select the SQL text to copy it manually.")); }}>Copy SQL</button>}</details>
          </div>}
        </article>;
      })}</div>
      <footer className={styles.footer}><span>Calculation details and source versions are available for each card.</span><Link href={analyzeHref}>Open Analyze<ArrowUpRight size={12} aria-hidden="true" /></Link></footer>
    </>}
  </main>;
}
