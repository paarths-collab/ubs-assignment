"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, clearPrivateState } from "@/lib/api";
import { AnalysisEvidence, AnomalySummary, type Chart, type Anomalies } from "@/components/analysis-evidence";
import { JoinEditor, JoinReview, type Source, type Join, type JoinProposal } from "@/components/join-editor";
import { DashboardDialog } from "@/components/dashboard-dialog";
import { ExportDialog } from "@/components/export-dialog";
import { ArrowRight, ArrowUp, ArrowUpRight, BarChart3, ChartNoAxesCombined, Columns3, Database, FileSpreadsheet, History, ListFilter, Plus, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import styles from "./analyze.module.css";

const fieldLabel = (name: string) => name.replaceAll("_", " ").replace(/\b(id|usd|sku|sql)\b/gi, word => word.toUpperCase()).replace(/^./, letter => letter.toUpperCase());
const fieldType = (name: string) => name.replace(/^./, letter => letter.toUpperCase());
type Dataset = Source;
type Version = { id: string; version: number; display_name: string };
type Conversation = { id: string; title: string; selected_dataset_versions: Version[] };
type Message = { id: string; role: string; content: string; status: string };
type Analysis = { id: string; status: string; question: string; answer?: string; clarification?: string;
  charts?: Chart[]; chart_error?: string; anomalies?: Anomalies; join_proposal?: JoinProposal;
  error?: string; sql?: string; dataset_versions: Version[]; method: {
    calculation?: string; filters?: string; grouping?: string; assumptions?: string[]; joins?: JoinProposal["diagnostics"];
    stages?: { name: string; metrics: string[]; filters: string; grouping: string; ordering: string }[] };
  table?: { columns: string[]; rows: Record<string, unknown>[]; returned_rows: number; truncated: boolean } };
type Detail = { conversation: Conversation; messages: Message[]; analyses: Analysis[] };
type SearchResult = { analysis_id: string; conversation_id: string; title: string;
  question: string; summary: string; score: number; href: string };

export default function Analyze() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("");
  const historyDialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const activeConversation = useRef<string | null>(null);
  const conversationRequest = useRef(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [multiply, setMultiply] = useState(false);
  const [group, setGroup] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchDone, setSearchDone] = useState(false);
  const [joinReviewTarget, setJoinReviewTarget] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<Dataset[]>("/datasets", { signal: controller.signal }), api<Conversation[]>("/conversations", { signal: controller.signal })]).then(([items, saved]) => {
      if (controller.signal.aborted) return;
      setDatasets(items); setConversations(saved);
      let ids: string[] = [];
      try { const value: unknown = JSON.parse(sessionStorage.getItem("selected-datasets") ?? "[]"); if (Array.isArray(value)) ids = value.filter((id): id is string => typeof id === "string"); } catch { /* Ignore stale browser state. */ }
      const restored = ids.filter(id => items.some(item => item.id === id)).slice(0, 5);
      const initial = restored.length ? restored : items.length === 1 ? [items[0].id] : [];
      setSelected(initial); sessionStorage.setItem("selected-datasets", JSON.stringify(initial));
      const prompt = new URLSearchParams(window.location.search).get("question");
      if (prompt) setQuestion(prompt.slice(0, 1000));
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) { clearPrivateState(); router.replace("/login"); }
      else setError("Could not load datasets and conversations. Reload to try again.");
    }).finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, [router]);
  const open = useCallback(async (id: string) => {
    const request = ++conversationRequest.current;
    if (activeConversation.current !== id) {
      setConfirmation(null); setMultiply(false); setGroup(""); setJoinReviewTarget(null); setCopyStatus("");
    }
    try {
      const detail = await api<Detail>(`/conversations/${id}`);
      if (request !== conversationRequest.current) return false;
      if (activeConversation.current !== id) {
        setConfirmation(null); setMultiply(false); setGroup(""); setJoinReviewTarget(null); setCopyStatus("");
      }
      activeConversation.current = id;
      setCurrent(id); setMessages(detail.messages); setAnalyses(detail.analyses);
      setConversations(previous => previous.map(item => item.id === id ? detail.conversation : item));
      const ids = detail.conversation.selected_dataset_versions.map(item => item.id);
      setSelected(ids); sessionStorage.setItem("selected-datasets", JSON.stringify(ids));
      setError("");
      return true;
    } catch {
      if (request === conversationRequest.current) setError("Conversation is unavailable. It may reference a deleted dataset.");
      return false;
    }
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const target = new URLSearchParams(window.location.search).get("conversation");
    if (target) {
      const timer = window.setTimeout(() => void open(target), 0);
      return () => window.clearTimeout(timer);
    }
  }, [open, loaded]);
  useEffect(() => {
    if (!joinReviewTarget) return;
    let attempts = 0;
    let timer: number | undefined;
    const scrollWhenReady = () => {
      const target = document.getElementById(`join-review-${joinReviewTarget}`);
      if (target) {
        target.scrollIntoView({ behavior: "auto", block: "start" });
        target.focus({ preventScroll: true });
        setJoinReviewTarget(null);
        return;
      }
      attempts += 1;
      if (attempts < 20) timer = window.setTimeout(scrollWhenReady, 50);
    };
    timer = window.setTimeout(scrollWhenReady, 0);
    return () => { if (timer) window.clearTimeout(timer); };
  }, [analyses, joinReviewTarget]);
  useEffect(() => {
    const show = () => { if (!historyDialog.current?.open) historyDialog.current?.showModal(); };
    window.addEventListener("open-insight-history", show);
    if (loaded && new URLSearchParams(window.location.search).get("history") === "1") show();
    return () => window.removeEventListener("open-insight-history", show);
  }, [loaded]);
  async function findHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!searchText.trim() || searchBusy) return;
    setSearchBusy(true); setSearchError(""); setSearchDone(false);
    try {
      const results = await api<SearchResult[]>("/search", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: searchText.trim() }) });
      setSearchResults(results); setSearchDone(true);
    } catch (cause) { setSearchError(cause instanceof Error ? cause.message : "Search unavailable. Try again."); }
    finally { setSearchBusy(false); }
  }
  async function indexHistory() {
    setSearchBusy(true); setSearchError("");
    try {
      const result = await api<{ indexed: number; remaining: number }>("/search/index", { method: "POST" });
      setSearchError(`${result.indexed} analyses indexed. ${result.remaining} may still need indexing.`);
    } catch (cause) { setSearchError(cause instanceof Error ? cause.message : "Could not index history."); }
    finally { setSearchBusy(false); }
  }
  async function rerunAnalysis(id: string) {
    setBusy(true); setError("");
    try {
      await api<Analysis>(`/analyses/${id}/rerun`, { method: "POST" });
      if (current) await open(current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rerun analysis."); }
    finally { setBusy(false); }
  }
  async function openSearchResult(item: SearchResult) {
    if (busy || !await open(item.conversation_id)) return;
    historyDialog.current?.close();
    window.setTimeout(() => document.getElementById(`analysis-${item.analysis_id}`)?.scrollIntoView({ behavior: "smooth" }), 0);
  }
  async function deleteAnalysis(item: Analysis) {
    if (!window.confirm(`Delete saved analysis "${item.question}"? This cannot be undone. It will be removed from search and become unavailable in dashboards. Conversation text, datasets and downloaded reports remain.`)) return;
    setBusy(true); setError(""); setCopyStatus("");
    try {
      await api(`/analyses/${item.id}`, { method: "DELETE" });
      setAnalyses(previous => previous.filter(analysis => analysis.id !== item.id));
      setSearchResults(previous => previous.filter(result => result.analysis_id !== item.id));
      if (confirmation === item.id) { setConfirmation(null); setMultiply(false); }
      setCopyStatus("Saved analysis deleted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the analysis. Try again."); }
    finally { setBusy(false); }
  }
  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id].slice(0, 5);
    setSelected(next); sessionStorage.setItem("selected-datasets", JSON.stringify(next));
    conversationRequest.current += 1; activeConversation.current = null;
    setCurrent(null); setMessages([]); setAnalyses([]); setError("");
    setConfirmation(null); setMultiply(false); setGroup("");
  }
  async function ensureConversation() {
    if (current) return current;
    const created = await api<Conversation>("/conversations", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataset_ids: selected }) });
    activeConversation.current = created.id;
    setCurrent(created.id); setConversations(previous => [created, ...previous]);
    return created.id;
  }
  async function review(joins: Join[]) {
    setBusy(true); setError(""); setConfirmation(null); setMultiply(false);
    try {
      const id = await ensureConversation();
      const reviewed = await api<Analysis>(`/conversations/${id}/joins`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joins }) });
      await open(id);
      setJoinReviewTarget(reviewed.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not inspect join keys."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || !selected.length || busy) return;
    setBusy(true); setError("");
    let id = current;
    try {
      id = await ensureConversation();
      const outcome = await api<Analysis>(`/conversations/${id}/messages`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text,
          join_confirmation: confirmation, accept_multiplication: multiply, anomaly_group_confirmation: group || null }) });
      await open(id); if (outcome.status === "complete") setQuestion("");
    } catch (cause) {
      if (id) await open(id);
      setError(cause instanceof Error ? cause.message : "Analysis failed. Try again.");
    } finally { setBusy(false); }
  }
  useEffect(() => {
    const reset = () => {
      if (busy) return;
      conversationRequest.current += 1; activeConversation.current = null;
      setCurrent(null); setMessages([]); setAnalyses([]); setQuestion(""); setError("");
      setConfirmation(null); setMultiply(false); setGroup(""); setCopyStatus("");
    };
    window.addEventListener("new-analysis", reset);
    return () => window.removeEventListener("new-analysis", reset);
  }, [busy]);
  const selectedSources = datasets.filter(item => selected.includes(item.id));
  const columns = selectedSources[0]?.profile.columns ?? [];
  const metric = columns.find(column => /^(revenue_usd|revenue|sales_amount|total_revenue)$/i.test(column.name)) ?? columns.find(column => /^(integer|decimal|double|float|number|bigint)$/i.test(column.type));
  const dateColumn = columns.find(column => /^(sale_date|order_date|transaction_date|date)$/i.test(column.name)) ?? columns.find(column => /date|timestamp/i.test(column.type));
  const category = columns.find(column => /^(region|territory|category|product_category|segment)$/i.test(column.name)) ?? columns.find(column => /^(string|text|varchar)$/i.test(column.type) && !/(_id|^id$)/i.test(column.name));
  const suggestions = [
    { icon: BarChart3, title: metric && category ? "Compare by category" : "Summarize your source", text: metric && category ? `Show total ${metric.name} by ${category.name} as a bar chart.` : "How many rows are in the selected dataset?", caption: metric && category ? `${metric.name} by ${category.name}` : "Start with an accurate record count" },
    { icon: ChartNoAxesCombined, title: metric && dateColumn ? "Explore a trend" : "Find a useful chart", text: metric && dateColumn ? `Show total ${metric.name} by calendar month using ${dateColumn.name} as a line chart.` : "Suggest a useful chart using the columns in this dataset.", caption: metric && dateColumn ? `Monthly view using ${dateColumn.name}` : "Choose a view that fits your columns" },
    { icon: Search, title: "Investigate outliers", text: metric ? `Detect outliers in ${metric.name} using the 1.5 × IQR rule across the entire dataset, without grouping.` : "Which numeric columns could be checked for outliers?", caption: metric ? `Inspect unusual ${metric.name} values` : "Identify a measurable starting point" },
    { icon: ListFilter, title: "Look at the detail", text: metric ? `Show the 10 records with the highest ${metric.name}.` : "Show a preview of 10 rows from the selected dataset.", caption: metric ? `Rank source records by ${metric.name}` : "Review a focused result table" },
  ];
  return <main id="main" className={styles.page}>
    <div className={styles.toolbar}><div><h1>Analysis</h1><p className={styles.pageDescription}>Ask questions and verify the results against your data.</p></div><div className={styles.actions}><button onClick={() => historyDialog.current?.showModal()}><History size={13} />History & search</button><DashboardDialog key={`dashboard-${selected.join(",") || "none"}`} ensureConversation={ensureConversation}
      sources={selected.map(id => datasets.find(d => d.id === id)?.display_name ?? id).join(", ")}
      confirmation={confirmation} multiply={multiply} choices={analyses.map(a => ({ id: a.id, title: a.question,
        status: a.status, sources: a.dataset_versions.map(v => `${v.display_name} v${v.version}`).join(", ") }))} />
      <ExportDialog key={`export-${(current ?? selected.join(",")) || "none"}`} choices={analyses.map(a => ({ id: a.id, title: a.question, status: a.status,
        sources: a.dataset_versions.map(v => `${v.display_name} v${v.version}`).join(", ") }))} /></div></div>
    <section className={styles.analysisMetrics} aria-label="Current analysis context">{[
      { label: "Selected sources", value: selected.length, detail: "Up to 5 per conversation", icon: Database },
      { label: "Source records", value: selectedSources.reduce((sum, source) => sum + source.profile.row_count, 0), detail: "Across selected files", icon: FileSpreadsheet },
      { label: "Computed answers", value: analyses.filter(item => item.status === "complete").length, detail: "In this conversation", icon: ShieldCheck },
      { label: "Visualizations", value: analyses.reduce((sum, item) => sum + (item.charts?.length ?? 0), 0), detail: "Saved with the answer", icon: BarChart3 },
    ].map(item => <div key={item.label}><item.icon size={14} /><span>{item.label}<small>{item.detail}</small></span><strong>{loaded ? item.value.toLocaleString() : "—"}</strong></div>)}</section>
    <div className={styles.layout}>
      <section className={`${styles.mainColumn} ${messages.length === 0 && analyses.length === 0 ? styles.emptyWorkspace : ""}`} aria-label="Conversation">
        {messages.length === 0 && analyses.length === 0 && <div className={styles.welcome}>
          <div className={styles.welcomeIcon} aria-hidden="true"><ChartNoAxesCombined size={23} strokeWidth={1.7} /></div><h2>What would you like to analyze?</h2><p>Explore trends, compare metrics, or investigate a specific question.</p>
          <div className={styles.capabilities}><span><BarChart3 size={12} />Charts & tables</span><span><Columns3 size={12} />SQL evidence</span><span><Search size={12} />Outlier checks</span><span><History size={12} />Follow-up questions</span></div>
          {loaded && !datasets.length && <Link className={styles.firstSource} href="/datasets">Add your first data source<ArrowRight size={13} /></Link>}
        </div>}
        {(messages.length > 0 || analyses.length > 0) &&         <div className="chat-history">
          {analyses.length === 0 && <ol className="messages">{messages.map(message => <li key={message.id} className={`chat-message chat-message-${message.role === "user" ? "user" : "assistant"}`}>
            <span className="chat-role">{message.role === "user" ? "You" : "Analyst"}</span><p>{message.content}</p></li>)}</ol>}
          {analyses.map(item => <article className="chat-turn" id={`analysis-${item.id}`} key={item.id}>
        <div className="chat-message chat-message-user"><span className="chat-role">You</span><p>{item.question}</p></div>
        <div className="chat-message chat-message-assistant">
        <div className="chat-answer-heading"><span className="chat-avatar">AI</span><div>
        <span className="chat-role">Analyst</span><h3>{item.status === "complete" ? "Computed answer" : item.status === "clarification" ? "Clarification" : "Analysis unavailable"}</h3>
        </div></div>
        <p className="chat-answer">{item.answer ?? item.clarification ?? item.error}</p>
        {item.status !== "complete" && /provider|api.?key|credential/i.test(item.error ?? "") && <button className={styles.connectionAction} onClick={() => window.dispatchEvent(new Event("open-workspace-help"))}>Open connection help<ArrowUpRight size={12} /></button>}
        {item.status === "complete" && item.sql && item.dataset_versions.length === 1 && <button type="button" disabled={busy}
          onClick={() => void rerunAnalysis(item.id)}>Rerun saved query</button>}
        {item.anomalies && <AnomalySummary value={item.anomalies} />}
        {item.chart_error && <p role="status">Chart unavailable: {item.chart_error} The computed table is available.</p>}
        {item.table && <AnalysisEvidence table={item.table} charts={item.charts} />}
        {item.join_proposal && <><JoinReview autoScroll={item.id === joinReviewTarget} targetId={`join-review-${item.id}`}
          proposal={item.join_proposal} sources={datasets} />
          <div className="join-confirmation">
          {item.join_proposal.requires_multiplication && <label className="join-consent"><input type="checkbox" checked={multiply}
            disabled={busy} onChange={e => { setMultiply(e.target.checked); setConfirmation(null); }} />
            I accept that these joins can multiply rows and distort aggregates.</label>}
          <button className="join-confirm-button" disabled={busy || (item.join_proposal.requires_multiplication && !multiply)}
            onClick={() => setConfirmation(item.id)}>{confirmation === item.id ? "These exact joins are confirmed" : "Confirm these keys and join types"}</button>
          </div></>}
        {item.sql && <><details><summary>Method</summary><p>Calculation: {item.method.calculation}</p>
          <p>Filters: {item.method.filters}</p><p>Grouping: {item.method.grouping}</p>
          {(item.method.stages?.length ?? 0) > 1 && item.method.stages?.map((s, i) => <div key={i}>
            <h4>Calculation stage: {s.name}</h4><p>{s.metrics.join(", ")}</p>
            <p>{s.filters} · {s.grouping} · {s.ordering}</p></div>)}
          {item.method.joins && <JoinReview proposal={{ joins: item.method.joins.map(d => d.join), diagnostics: item.method.joins,
            requires_multiplication: item.method.joins.some(d => Boolean(d.multiplies_left_rows || d.multiplies_right_rows)) }} sources={datasets} />}
          {item.method.assumptions?.map(text => <p key={text}>{text}</p>)}</details>
          <details><summary>SQL</summary><pre>{item.sql}</pre>
            <button onClick={() => { void navigator.clipboard.writeText(item.sql!).then(() => setCopyStatus("SQL copied."))
              .catch(() => setCopyStatus("Could not copy. Select the SQL text to copy manually.")); }}>Copy SQL</button></details></>}
        <p className="source-list">Sources: {item.dataset_versions.map(source => `${source.display_name} v${source.version}`).join(", ")}</p>
        <button type="button" className="delete-analysis" disabled={busy || searchBusy}
          onClick={() => void deleteAnalysis(item)}>Delete saved analysis</button>
        </div>
          </article>)}
        </div>}
        <div className={styles.composerWrap}>
          {error && <p className={styles.feedback} role="alert">{error}</p>}
          <div className={styles.activity} role="status">{busy ? <><span className={styles.pulse} />Working through your question…</> : copyStatus}</div>
          {confirmation && <p className={styles.confirmation}><ShieldCheck size={12} />Your confirmed joins will be used for this question.</p>}
          <form className={styles.composer} onSubmit={submit}><label htmlFor="question" className="visually-hidden">Question</label><textarea id="question" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={selected.length ? "Ask a question about your data…" : "Select a source to start an analysis…"} maxLength={1000} rows={2} /><div className={styles.composerBar}><Link href="/datasets" className={styles.attach} aria-label="Add data source"><Plus size={17} /></Link><span className={styles.sourceChips}>{selected.length ? <><FileSpreadsheet size={12} />{selected.length === 1 ? selectedSources[0]?.display_name : `${selected.length} sources`}</> : <><Database size={12} />No source selected</>}</span><span className={styles.enterHint}>Enter to send<span> · </span>Shift + Enter for a new line</span><button type="submit" aria-label="Ask question" disabled={busy || !selected.length || !question.trim()}><ArrowUp size={18} /></button></div></form>
          <p className={styles.composerNote}>AI can make mistakes. Review the SQL and source data behind each answer.</p>
        </div>
        {messages.length === 0 && analyses.length === 0 && <div className={styles.suggestionSection}><span>Suggested questions</span>          <div className={styles.suggestions}>{suggestions.map(item => <button key={item.title} disabled={busy || !selected.length} onClick={() => { setQuestion(item.text); document.getElementById("question")?.focus(); }}><item.icon size={18} strokeWidth={1.5} /><strong>{item.title}</strong><span>{item.caption}</span><ArrowUpRight size={13} /></button>)}</div></div>}
      </section>
      <aside className={styles.rail} aria-label="Analysis context"><div className={styles.railHeading}><span>YOUR CONTEXT</span><SlidersHorizontal size={13} /></div>
        <section className={styles.contextSection}><div className={styles.sectionHeading}><h2><Database size={13} />Data sources<span>{selected.length}/5</span></h2><Link href="/datasets" aria-label="Manage data sources"><Plus size={14} /></Link></div>
          {!datasets.length ? <div className={styles.noSources}><FileSpreadsheet size={22} /><p>Select a CSV or Excel source to begin.</p><Link href="/datasets">Add your first source<ArrowRight size={12} /></Link></div> : <div className={styles.sourceList}>{datasets.map(item => <label className={`${styles.sourceRow} ${selected.includes(item.id) ? styles.sourceSelected : ""}`} key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={busy || (!selected.includes(item.id) && selected.length >= 5)} onChange={() => toggle(item.id)} /><FileSpreadsheet size={15} /><span><strong>{item.display_name}</strong><small>{item.profile.row_count.toLocaleString()} rows · {item.profile.columns.length} columns</small></span></label>)}</div>}
          <p className={styles.contextHint}>Choose up to five sources. Switching sources starts a new conversation.</p>
          {selected.length > 1 && <JoinEditor key={selected.join(",")} sources={selectedSources} busy={busy} changed={() => { setConfirmation(null); setMultiply(false); }} review={joins => void review(joins)} />}
          {selected.length === 1 && <details className={styles.settings}><summary><SlidersHorizontal size={12} />Analysis options</summary><label>Group outlier checks by<select value={group} disabled={busy} onChange={event => setGroup(event.target.value)}><option value="">Entire dataset</option>{selectedSources[0]?.profile.columns.map(column => <option value={column.id} key={column.id}>{column.name}</option>)}</select></label></details>}
          {selectedSources.length > 0 && <details className={styles.fields}><summary><Columns3 size={12} />Explore source fields<span>{selectedSources.reduce((sum, source) => sum + source.profile.columns.length, 0)}</span></summary>{selectedSources.map(source => <div key={source.id}><strong>{source.display_name}</strong><div>{source.profile.columns.map(column => <button key={column.id} disabled={busy} title={`Insert original field: ${column.name}`} aria-label={`Use field ${column.name}, ${column.type}`} onClick={() => { setQuestion(previous => previous ? `${previous} ${column.name}`.slice(0, 1000) : `Summarize ${column.name} in the selected source.`); document.getElementById("question")?.focus(); }}><span>{fieldLabel(column.name)}</span><small>{fieldType(column.type)}</small></button>)}</div></div>)}</details>}
        </section>
        <section className={styles.contextSection}><div className={styles.sectionHeading}><h2><History size={13} />Recent conversations</h2></div>{conversations.length > 0 && <label className={styles.historyFilter}><Search size={12} /><input aria-label="Filter conversations" value={historyFilter} onChange={event => setHistoryFilter(event.target.value)} placeholder="Find a conversation…" /></label>}{!conversations.length ? <p className={styles.emptyHistory}>{loaded ? "Your conversations will appear here as you work." : "Loading conversations…"}</p> : <div className={styles.history}>{conversations.filter(item => item.title.toLowerCase().includes(historyFilter.toLowerCase())).map(item => <button key={item.id} disabled={busy} aria-current={current === item.id ? "page" : undefined} onClick={() => { void open(item.id); }}><span />{item.title}<ArrowUpRight size={11} /></button>)}{historyFilter && !conversations.some(item => item.title.toLowerCase().includes(historyFilter.toLowerCase())) && <p className={styles.emptyHistory}>No matching conversations.</p>}</div>}</section>

        <div className={styles.contextFooter}><ShieldCheck size={14} /><p>Your files stay in your workspace.<br />Calculations are always inspectable.</p></div>
      </aside>
    </div>
    <dialog ref={historyDialog} className={styles.historyDialog} aria-labelledby="history-dialog-title"><div className={styles.historyDialogHeading}><div><span>YOUR SAVED WORK</span><h2 id="history-dialog-title">Conversations & insights</h2><p>Reopen a conversation or search completed answers by meaning.</p></div><button aria-label="Close conversation history" onClick={() => historyDialog.current?.close()}><X size={18} /></button></div>
      <label className={styles.historyDialogSearch}><Search size={15} /><input aria-label="Filter saved conversations" placeholder="Find a conversation by title…" value={historyFilter} onChange={event => setHistoryFilter(event.target.value)} /></label><div className={styles.dialogConversationList}>{conversations.filter(item => item.title.toLowerCase().includes(historyFilter.toLowerCase())).map(item => <button key={item.id} disabled={busy} onClick={() => { void open(item.id).then(success => { if (success) historyDialog.current?.close(); }); }}><History size={15} /><span><strong>{item.title}</strong><small>{item.selected_dataset_versions.map(source => source.display_name).join(" · ")}</small></span><ArrowUpRight size={13} /></button>)}{!conversations.some(item => item.title.toLowerCase().includes(historyFilter.toLowerCase())) && <p>{conversations.length ? "No conversations match that title." : "Your conversations will appear here as you work."}</p>}</div>
        <details className={styles.historySearch}><summary><Search size={13} />Search saved insights</summary>      <form onSubmit={findHistory} className="question-form"><label htmlFor="history-query">Search by meaning</label>
        <input id="history-query" value={searchText} onChange={event => setSearchText(event.target.value)}
          maxLength={500} placeholder="Regional performance" />
        <button disabled={searchBusy || !searchText.trim()} type="submit">{searchBusy ? "Searching…" : "Search"}</button></form>
      <button type="button" disabled={searchBusy} onClick={() => void indexHistory()}>Index older analyses</button>
      {searchError && <p role="status">{searchError}</p>}
      {searchDone && searchResults.length === 0 && <p>No sufficiently relevant analyses found. Try another phrase, or index older analyses if saved history is missing.</p>}
      {searchResults.length > 0 && <ul className="conversation-list">{searchResults.map(item => <li key={item.analysis_id}>
        <button type="button" disabled={busy} onClick={() => void openSearchResult(item)}>
          <strong>{item.title}</strong> · {item.question} · similarity {item.score.toFixed(2)}</button>
        <p>{item.summary}</p></li>)}</ul>}</details>
      <p className={styles.historyDialogNote}>Semantic search uses your configured embedding provider. Only your own saved analyses are included.</p>
    </dialog>
  </main>;
}
