"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, BarChart3, CalendarDays, ChartNoAxesCombined, Check, CheckCheck, ChevronRight, CircleAlert, Database, LayoutDashboard, LoaderCircle, Plus, RefreshCw, SquareChartGantt } from "lucide-react";
import { api, ApiError, clearPrivateState } from "@/lib/api";
import { DashboardDialog } from "@/components/dashboard-dialog";
import { DashboardExplorer } from "@/components/dashboard-explorer";
import styles from "./dashboards.module.css";

type Summary = { id: string; title: string; created_at: string; status: string; complete_cards: number; total_cards: number; dataset_versions?: { display_name: string; version: number }[] };
type Dataset = { id: string; display_name: string; profile?: { row_count: number; column_count: number } };
const layouts = [
  { title: "Business overview", icon: LayoutDashboard, description: "Bring the important counts, totals, and distributions into one view.", prompt: "Create a useful business overview with up to six cards using the available source columns. Include record counts and supported numeric totals or category distributions. Only use columns that exist and explain the calculations.", kind: "overview" },
  { title: "Trends & performance", icon: ChartNoAxesCombined, description: "Explore recorded dates and measures to understand changes over time.", prompt: "Create a dashboard focused on recorded trends and performance using available numeric and date columns. Include monthly trends only where a valid date column exists; otherwise show useful supported breakdowns. Use observed data, without forecasting.", kind: "trend" },
  { title: "Category breakdown", icon: BarChart3, description: "Compare the groups that matter, with evidence behind each result.", prompt: "Create a dashboard comparing categories using supported source columns. Include relevant group counts, numeric totals, and rankings where available. Preserve source units and use only supported calculations.", kind: "category" },
];
type Filter = "all" | "complete" | "review";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Dashboards() {
  const router = useRouter();
  const [items, setItems] = useState<Summary[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const builder = useRef<HTMLElement>(null);
  const builderHeading = useRef<HTMLHeadingElement>(null);
  const firstSource = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api<Summary[]>("/dashboards"), api<Dataset[]>("/datasets")])
      .then(([saved, sources]) => {
        if (!active) return;
        setItems(saved); setDatasets(sources);
        try {
          const previous: unknown = JSON.parse(sessionStorage.getItem("selected-datasets") ?? "[]");
          if (Array.isArray(previous)) setSelected(previous.filter((id): id is string => typeof id === "string" && sources.some(source => source.id === id)).slice(0, 5));
        } catch { /* Source selection can start fresh if browser storage is unavailable. */ }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          clearPrivateState(); router.replace("/login");
        } else setError("Your dashboard library could not be loaded. Check the connection and try again.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, router]);

  const complete = items.filter(item => item.status === "complete").length;
  const completedCards = items.reduce((total, item) => total + item.complete_cards, 0);
  const visible = items.filter(item => (filter === "all" || (filter === "complete" ? item.status === "complete" : item.status !== "complete")) && `${item.title} ${item.dataset_versions?.map(source => source.display_name).join(" ") ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const ready = !loading && !error;

  function openBuilder() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    builder.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    const target = firstSource.current;
    (target && !target.disabled ? target : builderHeading.current)?.focus({ preventScroll: true });
  }

  function retry() { setLoading(true); setError(""); setAttempt(value => value + 1); }

  async function ensureConversation() {
    try {
      return (await api<{ id: string }>("/conversations", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_ids: selected }) })).id;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { clearPrivateState(); router.replace("/login"); }
      throw cause;
    }
  }

  return <main id="main" className={`content ${styles.page}`}>
    <div className={styles.breadcrumb}><span>Workspace</span><ChevronRight size={13} aria-hidden="true" /><span>Dashboards</span></div>
    <header className={styles.heading}>
      <div><h1>Dashboards</h1>
        <p>Create and manage saved views of your analysis.</p></div>
      <div className={styles.headingActions}><a href="#dashboard-preview" className={styles.previewLink}>Explore charts<ArrowRight size={14} aria-hidden="true" /></a><button className={styles.primaryButton} onClick={openBuilder}><Plus size={16} aria-hidden="true" />New dashboard</button></div>
    </header>

    <div className={styles.metrics} aria-label="Dashboard library summary">
      <div className={styles.metricCard}><span className={styles.metricLabel}><LayoutDashboard size={16} aria-hidden="true" />Saved dashboards</span>
        <div className={styles.metricBottom}><strong>{ready ? items.length : "—"}</strong><span>In your library</span></div></div>
      <div className={styles.metricCard}><span className={styles.metricLabel}><CheckCheck size={16} aria-hidden="true" />Complete dashboards</span>
        <div className={styles.metricBottom}><strong>{ready ? complete : "—"}</strong><span>Every card computed</span></div></div>
      <div className={styles.metricCard}><span className={styles.metricLabel}><SquareChartGantt size={16} aria-hidden="true" />Computed cards</span>
        <div className={styles.metricBottom}><strong>{ready ? completedCards : "—"}</strong><span>Saved answers &amp; charts</span></div></div>
    </div>

    <section className={styles.layouts} aria-labelledby="dashboard-layout-title"><div className={styles.layoutHeading}><div><span>BUILT AROUND YOUR DATA</span><h2 id="dashboard-layout-title">Choose a starting point.</h2><p>Start with a focused request, then customize the title, sources, and generated cards.</p></div><span>Up to six computed cards</span></div><div className={styles.layoutGrid}>{layouts.map((item, index) => <button key={item.title} aria-pressed={layout === index} onClick={() => { setLayout(index); openBuilder(); }}><div className={styles.layoutPreview} aria-hidden="true" data-kind={item.kind}><span /><span /><span /><span /><span /><i>Layout idea</i></div><div className={styles.layoutTitle}><item.icon size={15} /><h3>{item.title}</h3><ArrowUpRight size={14} /></div><p>{item.description}</p><span className={styles.layoutAction}>{layout === index ? "Selected layout" : "Use this layout"}<ArrowRight size={12} /></span></button>)}</div></section>
    <DashboardExplorer />
    <div className={styles.workGrid}>
      <section className={styles.library} aria-labelledby="library-heading">
        <div className={styles.sectionHeading}><div><h2 id="library-heading">Saved dashboards <span>{ready ? items.length : "—"}</span></h2>
          <p>Reopen saved results, charts and calculation details.</p></div><LayoutDashboard size={17} aria-hidden="true" /></div>
        {items.length > 0 && <label className={styles.librarySearch}><span>Search dashboards</span><input type="search" aria-label="Search dashboards" placeholder="Search titles or source names…" value={search} onChange={event => setSearch(event.target.value)} /></label>}
        {items.length > 0 && <div className={styles.filters} aria-label="Filter dashboards">
          {(["all", "complete", "review"] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value === "all" ? "All dashboards" : value === "complete" ? "Complete" : "Needs review"}
          </button>)}
        </div>}
        {loading ? <div className={styles.loading} role="status"><LoaderCircle size={20} className={styles.spinner} aria-hidden="true" /><p>Loading dashboards…</p></div>
          : error ? <div className={styles.errorState} role="alert"><CircleAlert size={25} aria-hidden="true" /><h3>Unable to load dashboards</h3><p>{error}</p>
            <button className={styles.secondaryButton} onClick={retry}><RefreshCw size={14} aria-hidden="true" />Try again</button></div>
            : !items.length ? <div className={styles.emptyState}>
              <LayoutDashboard size={28} aria-hidden="true" />
              <h3>No dashboards yet</h3><p>Select your data sources to create a dashboard with saved metrics and charts.</p>
              <button className={styles.emptyAction} onClick={openBuilder}>Create dashboard<ArrowRight size={15} aria-hidden="true" /></button>
              <div className={styles.emptyFootnote}><Check size={13} aria-hidden="true" />Saved with source versions and calculation details.</div>
            </div>
              : !visible.length ? <div className={styles.filterEmpty}><CheckCheck size={25} aria-hidden="true" /><h3>{search ? "No matching dashboards" : filter === "review" ? "All dashboards are complete" : "No complete dashboards"}</h3>
                <p>{filter === "review" ? "All saved dashboards have complete cards." : "Open a saved view to review its available evidence."}</p>
                <button className={styles.secondaryButton} onClick={() => { setFilter("all"); setSearch(""); }}>View all dashboards</button></div>
                : <div className={styles.savedGrid}>{visible.map(item => <Link href={`/dashboards/${item.id}`} className={styles.savedCard} key={item.id}>
                  <div className={styles.savedTop}><span className={`${styles.status} ${item.status === "complete" ? styles.statusComplete : styles.statusReview}`}>
                    <i />{item.status === "complete" ? "Complete" : "Needs review"}</span><ArrowUpRight size={17} aria-hidden="true" /></div>
                  <h3>{item.title}</h3><p>{item.complete_cards} of {item.total_cards} cards complete</p><div className={styles.cardProgress} role="img" aria-label={`${item.complete_cards} of ${item.total_cards} cards are complete`}>{Array.from({ length: Math.max(1, Math.min(6, item.total_cards)) }, (_, index) => <i key={index} data-complete={index < item.complete_cards} />)}</div><div className={styles.savedSources}>{item.dataset_versions?.slice(0, 2).map((source, index) => <span key={index}><Database size={10} />{source.display_name}</span>)}</div>
                  <div className={styles.savedFooter}><span><CalendarDays size={12} aria-hidden="true" />{formatDate(item.created_at)}</span><span>Open view<ArrowRight size={12} aria-hidden="true" /></span></div>
                </Link>)}</div>}
        {ready && items.length >= 50 && <p className={styles.libraryNote}>Showing your 50 most recent dashboards.</p>}
      </section>

      <aside className={styles.builderColumn}>
        <section className={styles.builder} ref={builder} aria-labelledby="builder-heading">
          <h2 id="builder-heading" tabIndex={-1} ref={builderHeading}>Create a dashboard</h2>
          <p className={styles.builderDescription}>Select up to five datasets to generate a saved dashboard.</p><div className={styles.selectedLayout}><LayoutDashboard size={13} /><span>{layouts[layout].title}</span><Check size={12} /></div>
          <div className={styles.sourceHeading}><span>Available datasets</span><span>{selected.length}<em> / 5 selected</em></span></div>
          {loading ? <p className={styles.sourcesEmpty}>Loading your sources…</p> : error ? <p className={styles.sourcesEmpty}>Reconnect to choose your data sources.</p>
            : !datasets.length ? <div className={styles.noSources}><Database size={21} aria-hidden="true" /><p>Upload a dataset to create a dashboard.</p>
              <Link href="/datasets">Add a dataset<ArrowUpRight size={13} aria-hidden="true" /></Link></div>
              : <fieldset className={styles.sourceList}><legend className="visually-hidden">Select up to five datasets</legend>{datasets.map((dataset, index) => {
                const checked = selected.includes(dataset.id);
                return <label key={dataset.id} className={`${styles.source} ${checked ? styles.sourceSelected : ""}`}>
                  <input type="checkbox" ref={index === 0 ? firstSource : undefined} checked={checked} disabled={!checked && selected.length >= 5}
                    onChange={event => setSelected(previous => event.target.checked ? [...previous, dataset.id].slice(0, 5) : previous.filter(id => id !== dataset.id))} />
                  <span className={styles.sourceFile}><Database size={14} aria-hidden="true" /></span>
                  <span className={styles.sourceCopy}><strong title={dataset.display_name}>{dataset.display_name}</strong><small>{dataset.profile ? `${dataset.profile.row_count.toLocaleString()} rows · ${dataset.profile.column_count} columns` : "Stored dataset"}</small></span>
                  <span className={styles.sourceCheck} aria-hidden="true">{checked && <Check size={11} />}</span>
                </label>;
              })}</fieldset>}
          <div className={styles.builderAction}><DashboardDialog key={`${selected.join(",")}-${layout}`} initialTitle={layouts[layout].title} initialPrompt={layouts[layout].prompt}
            sources={datasets.filter(dataset => selected.includes(dataset.id)).map(dataset => dataset.display_name).join(", ")}
            ensureConversation={ensureConversation} /></div>
          <p className={styles.builderHint}>{selected.length ? "Each dashboard supports up to six computed cards." : "Select at least one dataset to continue."}</p>
        </section>
        <div className={styles.contextNote}><span className={styles.contextIcon}><Database size={16} aria-hidden="true" /></span><div><strong>Combining datasets</strong>
          <p>Confirm how your sources connect in Analyze, then build your dashboard.</p><Link href="/analyze" onClick={() => sessionStorage.setItem("selected-datasets", JSON.stringify(selected))}>Open Analyze<ArrowUpRight size={12} aria-hidden="true" /></Link></div></div>
      </aside>
    </div>
    <footer className={styles.pageFooter}><span><span />Saved results include their source versions.</span><Link href="/overview">Workspace overview<ArrowUpRight size={12} aria-hidden="true" /></Link></footer>
  </main>;
}
