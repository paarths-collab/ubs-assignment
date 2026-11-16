"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, ArrowUpRight, BarChart3, CircleHelp, Database, Fingerprint, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Square, Table2 } from 'lucide-react';
import { AnalysisEvidence, type Chart, type Result } from '@/components/analysis-evidence';
import sourceStyles from '../../analyze/analyze.module.css';
import styles from './connected.module.css';
import { consumeAnalysis, type AnalysisEvent } from './stream';

type Filters = { organisation: string; eventType: string; severity: string; dateFrom?: string; dateTo?: string };
type Metadata = { recordCount: number; organisations: string[]; eventTypes: string[]; severities: string[]; dateRange: { min: string; max: string } };
type Health = { status: string; dataLoaded: boolean; aiConfigured: boolean };
type Metric = { value: number | null; applicable: boolean; unit: string };
type Overview = { eventCount: number; datasetEventCount: number; filters: Filters; kpis: Record<string, Metric>; distributions: { severity: Record<string, number> }; exposure: { realised: { grossAmountUsd: number | null; netAmountUsd: number | null; recoveryAmountUsd: number | null }; potential: { totalUsd: number | null }; operational: { totalRemediationHours: number } } };
type Section = { id: string; title: string; text: string };
type Answer = { title: string; sections: Section[]; eventCount: number; durationMs?: number; complete: boolean };
type Lens = 'analyse' | 'unusual' | 'investigate';
const initialFilters: Filters = { organisation: 'Enterprise-wide', eventType: 'All', severity: 'All' };
const lenses: { lens: Lens; title: string; description: string; icon: typeof BarChart3 }[] = [
  { lens: 'analyse', title: 'Explain this portfolio', description: 'Evidence, context and priorities', icon: BarChart3 },
  { lens: 'unusual', title: 'Explore concentrations', description: 'Patterns worth a closer look', icon: Fingerprint },
  { lens: 'investigate', title: 'Plan an investigation', description: 'Bounded checks and next steps', icon: ShieldCheck },
];
const count = (value: number) => value.toLocaleString('en-US');
const amount = (value: number | null) => value === null ? 'Not available' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

async function request<T>(path: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(`/api/operational/${path}`, { signal, cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'The operational backend is unavailable.');
  return result as T;
}

export default function ConnectedAnalyze() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [evidenceError, setEvidenceError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const run = useRef<AbortController | null>(null);

  useEffect(() => {
    const startNew = () => {
      run.current?.abort(); run.current = null;
      setBusy(false); setQuestion(''); setAnswer(null); setAnalysisError('');
    };
    window.addEventListener('new-analysis', startNew);
    return () => window.removeEventListener('new-analysis', startNew);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    run.current?.abort();
    Promise.all([
      request<Metadata>('metadata', controller.signal),
      request<Health>('health', controller.signal),
      request<Overview>('overview', controller.signal, { filters }),
    ]).then(([meta, status, evidence]) => {
      if (controller.signal.aborted) return;
      setMetadata(meta); setHealth(status); setOverview(evidence);
      setEvidenceError(''); setLoading(false);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setEvidenceError(error instanceof Error ? error.message : 'Could not load source evidence.'); setLoading(false);
    });
    return () => { controller.abort(); run.current?.abort(); };
  }, [filters, attempt]);

  function resetRun() { run.current?.abort(); run.current = null; setBusy(false); setAnswer(null); setAnalysisError(''); }
  function changeFilter(patch: Partial<Filters>) {
    resetRun(); setLoading(true); setOverview(null); setEvidenceError(''); setFilters(previous => ({ ...previous, ...patch }));
  }
  function refresh() { resetRun(); setLoading(true); setOverview(null); setHealth(null); setEvidenceError(''); setAttempt(value => value + 1); }
  const canAnalyse = !loading && Boolean(overview?.eventCount) && health?.aiConfigured === true && !busy;

  async function analyse(lens?: Lens, event?: FormEvent) {
    event?.preventDefault();
    if (!canAnalyse || (!lens && !question.trim())) return;
    run.current?.abort();
    const controller = new AbortController(); run.current = controller;
    setBusy(true); setAnalysisError(''); setAnswer(null);
    const endpoint = lens ? 'portfolio' : 'follow-up';
    const body = lens ? { filters, lens } : { filters, context: 'ai-analysis', question: question.trim() };
    const receive = (message: AnalysisEvent) => {
      if (controller.signal.aborted || run.current !== controller) return;
      switch (message.type) {
        case 'analysis_start': setAnswer({ title: message.title, eventCount: message.eventCount, sections: [], complete: false }); break;
        case 'section_start': setAnswer(previous => previous ? { ...previous, sections: [...previous.sections, { id: message.sectionId, title: message.title, text: '' }] } : previous); break;
        case 'section_delta': setAnswer(previous => previous ? { ...previous, sections: previous.sections.map(section => section.id === message.sectionId ? { ...section, text: section.text + message.delta } : section) } : previous); break;
        case 'analysis_complete': setAnswer(previous => previous ? { ...previous, complete: true, eventCount: message.evidence.eventCount, durationMs: message.durationMs } : previous); break;
        case 'analysis_error': setAnswer(null); setAnalysisError(message.message); break;
      }
    };
    try {
      const response = await fetch(`/api/operational/ai/${endpoint}/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      await consumeAnalysis(response, receive, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted && run.current === controller) { setAnswer(null); setAnalysisError(error instanceof Error ? error.message : 'Analysis is unavailable.'); }
    } finally {
      if (run.current === controller) { run.current = null; setBusy(false); }
    }
  }

  const severityRows = overview ? Object.entries(overview.distributions.severity).map(([severity, events]) => ({ severity, events })) : [];
  const severityTable: Result = { columns: ['severity', 'events'], rows: severityRows, returned_rows: severityRows.length, truncated: false };
  const severityChart: Chart = { type: 'bar', title: 'Events by severity', x_label: 'Severity', y_label: 'Event count', points: severityRows.map(row => ({ x: row.severity, y: row.events })), caveats: ['Counts are computed by the backend for the current filters. Synthetic source records.'] };
  const financialRows = overview ? [
    { measure: 'Gross exposure', value_usd: overview.exposure.realised.grossAmountUsd },
    { measure: 'Recovery', value_usd: overview.exposure.realised.recoveryAmountUsd },
    { measure: 'Net exposure', value_usd: overview.exposure.realised.netAmountUsd },
    { measure: 'Potential impact', value_usd: overview.exposure.potential.totalUsd },
  ] : [];

  return <main id="main" className={`${sourceStyles.page} ${styles.page}`}>
    <header className={sourceStyles.toolbar}><div><span className={styles.eyebrow}>CONNECTED ANALYSIS WORKSPACE</span><h1>Ask your data</h1><p className={sourceStyles.pageDescription}>Explore the operational dataset. Verify every answer against computed evidence.</p></div><div className={sourceStyles.actions}><button onClick={refresh} disabled={loading}><RefreshCw size={13} />Refresh source</button><Link className={styles.sourceLink} href="/workspace/datasets">Data sources<ArrowUpRight size={13} /></Link></div></header>
    <div className={styles.sourceNotice}><Database size={14} /><span>Synthetic operational data · {health?.dataLoaded ? 'Connected to backend' : loading ? 'Connecting to backend…' : 'Connection unavailable'}</span><span className={styles.provider}>{health?.aiConfigured ? 'AI provider configured' : health ? 'AI provider not configured' : 'AI status unavailable'}</span></div>
    <section className={sourceStyles.analysisMetrics} aria-label="Computed source metrics">{[
      { label: 'Events in scope', value: overview ? count(overview.eventCount) : '—', detail: 'Matching your filters', icon: Database },
      { label: 'High severity', value: overview ? count(overview.distributions.severity.High ?? 0) : '—', detail: 'Recorded classifications', icon: ShieldCheck },
      { label: 'Net exposure', value: overview ? amount(overview.exposure.realised.netAmountUsd) : '—', detail: 'Financial events · USD', icon: BarChart3 },
      { label: 'Source records', value: metadata ? count(metadata.recordCount) : '—', detail: 'Complete source population', icon: Table2 },
    ].map(metric => <div key={metric.label}><metric.icon size={15} /><span>{metric.label}<small>{metric.detail}</small></span><strong className={styles.metricValue}>{metric.value}</strong></div>)}</section>
    {evidenceError && <p role="alert" className={sourceStyles.feedback}>{evidenceError} <button onClick={refresh}>Retry connection</button></p>}
    <div className={sourceStyles.layout}><div className={sourceStyles.mainColumn}>
      <section className={sourceStyles.emptyWorkspace}><div className={sourceStyles.welcome}><div className={styles.artwork}><Image src="/template-preview/ai.webp" alt="" width={132} height={86} /><span>Evidence → interpretation → investigation</span></div><h2>Turn questions into understanding.</h2><p>Start with a portfolio lens, or ask about the current selection. Source metrics remain available independently of AI.</p><div className={sourceStyles.capabilities}><span><BarChart3 size={12} />Computed charts</span><span><ShieldCheck size={12} />Grounded analysis</span><span><Database size={12} />Synthetic source</span></div></div>
        <form className={sourceStyles.composerWrap} onSubmit={event => void analyse(undefined, event)}><div className={sourceStyles.composer}><label className={styles.srOnly} htmlFor="operational-question">Ask about the selected operational data</label><textarea id="operational-question" value={question} maxLength={1000} onChange={event => setQuestion(event.target.value)} placeholder="What should I investigate in this portfolio?" disabled={busy} /><div className={sourceStyles.composerBar}><span className={sourceStyles.sourceChips}><Database size={12} />{overview ? `${count(overview.eventCount)} source events` : 'Waiting for source'}</span><span className={sourceStyles.enterHint}>{question.length}/1000</span>{busy ? <button type="button" aria-label="Stop analysis" onClick={resetRun}><Square size={14} /></button> : <button type="submit" aria-label="Run analysis" disabled={!canAnalyse || !question.trim()}><ArrowUp size={17} /></button>}</div></div><p className={sourceStyles.composerNote}>{health && !health.aiConfigured ? 'AI is not configured on the connected backend. Computed evidence below is available; no AI answer has been generated.' : 'AI interpretations are separate from source calculations. Review the evidence before acting.'}</p></form>
        <div className={sourceStyles.suggestionSection}><span>EXPLORE THE CURRENT SCOPE</span><div className={`${sourceStyles.suggestions} ${styles.lenses}`}>{lenses.map(item => <button key={item.lens} disabled={!canAnalyse} onClick={() => void analyse(item.lens)}><item.icon size={18} /><strong>{item.title}</strong><span>{item.description}</span></button>)}</div></div>
      </section>
      {loading && <p className={styles.loading} role="status"><LoaderCircle size={15} />Loading computed evidence…</p>}
      {busy && <p className={styles.loading} role="status"><LoaderCircle size={15} />The backend is preparing and validating analysis…</p>}
      {analysisError && <div className={sourceStyles.feedback} role="alert"><strong>Analysis unavailable</strong><p>{analysisError}</p><p>Computed source evidence is preserved below. No replacement answer was generated.</p></div>}
      {answer && <section className={styles.answer} aria-label="Backend analysis"><div className={styles.answerHeading}><Sparkles size={17} /><div><span>{answer.complete ? 'AI-generated interpretation · server validated' : 'Analysis in progress'}</span><h2>{answer.title}</h2></div></div>{answer.sections.map(section => <div key={section.id}><h3>{section.title}</h3><p className={styles.prose}>{section.text || 'Preparing this section…'}</p></div>)}<footer>{count(answer.eventCount)} source events · {answer.complete ? `Completed in ${((answer.durationMs ?? 0) / 1000).toFixed(1)}s` : 'Awaiting completion'} · Current page only</footer></section>}
      {overview && <section className={styles.evidence}><div className={styles.evidenceHeading}><div><span className={styles.eyebrow}>COMPUTED BY THE BACKEND</span><h2>Evidence you can inspect</h2></div><ShieldCheck size={19} /></div>{!overview.eventCount ? <p>No events match these filters. Change the selection to explore the source.</p> : <><AnalysisEvidence table={severityTable} charts={[severityChart]} interactive /><details className={styles.financial}><summary>Exposure and potential impact · USD</summary><AnalysisEvidence table={{ columns: ['measure', 'value_usd'], rows: financialRows, returned_rows: financialRows.length, truncated: false }} charts={[]} /><p>Gross, recovery and net figures cover Financial events. Potential impact covers both event types and is separate from realised exposure. Missing amounts remain unavailable.</p></details></>}<details className={styles.method}><summary><CircleHelp size={14} />How this evidence is produced</summary><p>The existing backend applies the selected organisation, event type, severity and occurrence dates to its synthetic source. Counts and financial aggregates are deterministic calculations. These views do not execute SQL.</p><p>Scope: {overview.filters.organisation} · {overview.filters.eventType} · {overview.filters.severity} · {overview.filters.dateFrom} to {overview.filters.dateTo}.</p></details></section>}
    </div><aside className={`${sourceStyles.rail} ${styles.rail}`}><div className={sourceStyles.railHeading}>ANALYSIS CONTEXT<Database size={13} /></div><section className={sourceStyles.contextSection}><div className={sourceStyles.sectionHeading}><h2>Source selection</h2></div><div className={`${sourceStyles.sourceRow} ${sourceStyles.sourceSelected}`}><Database size={15} /><span><strong>Operational events</strong><small>{metadata ? count(metadata.recordCount) : '—'} synthetic records · existing backend</small></span></div><div className={styles.filters}>
      <label>Organisation<select value={filters.organisation} disabled={!metadata || busy} onChange={event => changeFilter({ organisation: event.target.value })}>{[...new Set(['Enterprise-wide', ...(metadata?.organisations ?? [])])].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Event type<select value={filters.eventType} disabled={!metadata || busy} onChange={event => changeFilter({ eventType: event.target.value })}>{[...new Set(['All', ...(metadata?.eventTypes ?? [])])].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Severity<select value={filters.severity} disabled={!metadata || busy} onChange={event => changeFilter({ severity: event.target.value })}>{[...new Set(['All', ...(metadata?.severities ?? [])])].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>From<input type="date" value={filters.dateFrom ?? ''} disabled={!metadata || busy} max={filters.dateTo} onChange={event => changeFilter({ dateFrom: event.target.value || undefined })} /></label><label>To<input type="date" value={filters.dateTo ?? ''} disabled={!metadata || busy} min={filters.dateFrom} onChange={event => changeFilter({ dateTo: event.target.value || undefined })} /></label><button onClick={() => changeFilter({ ...initialFilters, dateFrom: undefined, dateTo: undefined })} disabled={busy}>Reset filters</button>
    </div></section><section className={`${sourceStyles.contextSection} ${styles.availability}`}><div className={sourceStyles.sectionHeading}><h2>Workspace capabilities</h2></div><p className={sourceStyles.contextHint}>Source filtering, computed evidence and configured AI analysis connect to the existing backend.</p><button disabled>Saved conversations</button><button disabled>Upload and join files</button><p className={sourceStyles.contextHint}>These operations require the separate account and dataset service. Analysis on this page is not saved as a conversation.</p></section><div className={sourceStyles.contextFooter}><ShieldCheck size={16} /><p>Synthetic evidence. Descriptive observations do not establish causation.</p></div></aside></div>
  </main>;
}
