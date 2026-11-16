"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Database, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { AnalysisEvidence, type Chart, type Result } from '@/components/analysis-evidence';
import { count, filterSource, initialFilters, money, operational, type Filters, type Metadata, type Source, type SourceEvent } from '../overview/data';
import { monthLabel, periodEvents, timelineMonths, timelineRangeError } from './timeline-data';
import styles from './timeline.module.css';

const PAGE_SIZE = 12;
type LoadState = { attempt: number; source?: Source; metadata?: Metadata; error?: string };
export default function TimelinePage() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ attempt: -1 });
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [period, setPeriod] = useState('');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<SourceEvent | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([operational<Source>('source-events', controller.signal), operational<Metadata>('metadata', controller.signal)])
      .then(([source, metadata]) => { if (!controller.signal.aborted) setState({ attempt, source, metadata }); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setState({ attempt, error: cause instanceof Error ? cause.message : 'The timeline could not be loaded. Please retry.' }); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => { if (active) dialog.current?.showModal(); else dialog.current?.close(); }, [active]);
  const source = state.attempt === attempt ? state.source : undefined;
  const metadata = state.attempt === attempt ? state.metadata : undefined;
  const error = state.attempt === attempt ? state.error : undefined;
  const loading = state.attempt !== attempt;
  const dateFrom = filters.dateFrom || metadata?.dateRange.min || '';
  const dateTo = filters.dateTo || metadata?.dateRange.max || '';
  const dateError = dateFrom && dateTo ? timelineRangeError(dateFrom, dateTo) : null;
  const invalidDates = Boolean(dateError);
  const scoped = useMemo(() => invalidDates ? [] : filterSource(source?.events ?? [], filters), [source, filters, invalidDates]);
  const months = useMemo(() => timelineMonths(scoped, dateFrom, dateTo), [scoped, dateFrom, dateTo]);
  const records = useMemo(() => periodEvents(scoped, period), [scoped, period]);
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = records.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const summary = useMemo(() => records.reduce((result, event) => ({
    high: result.high + Number(event.severity === 'High'),
    net: event.netAmountUsd === null ? result.net : (result.net ?? 0) + event.netAmountUsd,
    hours: result.hours + event.remediationHours,
  }), { high: 0, net: null as number | null, hours: 0 }), [records]);
  const charts = useMemo<Chart[]>(() => [
    { type: 'bar', title: 'Event activity by occurrence month', x_label: 'Occurrence month', y_label: 'Events', points: months.map(month => ({ x: month.month, y: month.events })), caveats: ['All charts use the current organisation, type, severity, and date scope. Months with no events are retained. Select a period below to inspect its records.'] },
    { type: 'line', title: 'High-severity events over time', x_label: 'Occurrence month', y_label: 'High-severity events', points: months.map(month => ({ x: month.month, y: month.high })), caveats: ['Counts describe recorded events, not an estimated risk score or forecast.'] },
    { type: 'line', title: 'Net financial exposure over time', x_label: 'Occurrence month', y_label: 'Net exposure (USD)', points: months.map(month => ({ x: month.month, y: month.netExposure })), caveats: ['Null marks months without applicable financial amounts. Net exposure describes losses, not revenue.'] },
  ], [months]);
  const table = useMemo<Result>(() => ({ columns: ['Month', 'Events', 'High severity', 'Financial events', 'Net exposure (USD)', 'Remediation hours'], rows: months.map(month => ({ Month: month.month, Events: month.events, 'High severity': month.high, 'Financial events': month.financial, 'Net exposure (USD)': month.netExposure, 'Remediation hours': month.remediationHours })), returned_rows: months.length, truncated: false }), [months]);
  function change(name: keyof Filters, value: string) {
    setFilters(previous => ({ ...previous, [name]: value || undefined }));
    setPeriod(''); setPage(1);
  }
  function selectPeriod(value: string) { setPeriod(value); setPage(1); }
  const periodTitle = period ? monthLabel(period) : 'All selected dates';
  return <main id="main" className={styles.page}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>FOLLOW THE EVENTS</span><h1>Timeline</h1><p>See when events occurred, compare monthly activity, and inspect the records behind each period.</p></div><Link href="/workspace/datasets" className={styles.link}><Database size={14} /> Browse source <ArrowUpRight size={13} /></Link></div>
    <div className={styles.filters} aria-label="Timeline filters">
      <label>Organisation<select value={filters.organisation} onChange={event => change('organisation', event.target.value)}><option>Enterprise-wide</option>{metadata?.organisations.filter(value => value !== 'Enterprise-wide').map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Event type<select value={filters.eventType} onChange={event => change('eventType', event.target.value)}>{['All', 'Financial', 'Non-Financial'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Severity<select value={filters.severity} onChange={event => change('severity', event.target.value)}>{['All', 'Low', 'Moderate', 'High'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>From<input type="date" value={filters.dateFrom ?? ''} min={metadata?.dateRange.min} max={metadata?.dateRange.max} onChange={event => change('dateFrom', event.target.value)} /></label>
      <label>To<input type="date" value={filters.dateTo ?? ''} min={metadata?.dateRange.min} max={metadata?.dateRange.max} onChange={event => change('dateTo', event.target.value)} /></label>
      <button onClick={() => { setFilters(initialFilters); selectPeriod(''); }}>Reset</button>
    </div>
    {invalidDates && <div className={styles.error} role="alert">{dateError}</div>}
    {error && <div className={styles.error} role="alert"><span>{error}</span><button onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14} /> Retry</button></div>}
    {loading && <div className={styles.empty} role="status"><LoaderCircle size={23} className={styles.spinner} /><p>Loading the canonical event timeline…</p></div>}
    {source && metadata && !invalidDates && <>
      <div className={styles.metrics} aria-label={`Summary for ${periodTitle}`}>
        {[
          ['Events', count(records.length), periodTitle],
          ['High severity', count(summary.high), 'Recorded classification'],
          ['Net exposure', money(summary.net, true), 'Applicable financial amounts · USD'],
          ['Remediation effort', count(summary.hours), 'Recorded hours'],
        ].map(([label, value, note]) => <div className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
      </div>
      <section className={styles.card} aria-labelledby="activity-title"><div className={styles.cardHeading}><div><h2 id="activity-title">Activity across the source</h2><p>{dateFrom} to {dateTo} · {count(scoped.length)} events in the current filter scope</p></div><span className={styles.badge}><Database size={11} /> Synthetic operational data</span></div>
        {months.length ? <div className={styles.evidence}><AnalysisEvidence table={table} charts={charts} interactive /></div> : <div className={styles.empty}><CalendarDays size={24} /><p>No recorded period is available for this scope.</p></div>}
      </section>
      <section className={styles.card} aria-labelledby="records-title"><div className={styles.cardHeading}><div><h2 id="records-title">Explore a period</h2><p>Choose a month to focus the summary and event records below.</p></div><span className={styles.badge}><CalendarDays size={11} /> {periodTitle}</span></div>
        <div className={styles.periods} role="group" aria-label="Choose an occurrence month"><button aria-pressed={!period} onClick={() => selectPeriod('')}>All dates <small>{count(scoped.length)}</small></button>{months.map(month => <button key={month.month} aria-pressed={period === month.month} onClick={() => selectPeriod(month.month)}>{monthLabel(month.month)} <small>{count(month.events)}</small></button>)}</div>
        <p className={styles.scopeNote} aria-live="polite">{count(records.length)} records in {periodTitle.toLowerCase()}. Events are ordered by occurrence date, newest first.</p>
        {records.length ? <ol className={styles.list}>{visible.map(event => <li key={event.eventId} className={styles.event}><div className={styles.eventHeader}><div><time dateTime={event.occurrenceDate}>{event.occurrenceDate}</time><h3>{event.title}</h3></div><button onClick={() => setActive(event)} aria-label={`Inspect ${event.eventId}`}>Inspect record <ArrowUpRight size={13} /></button></div><div className={styles.eventMeta}><span>{event.eventId}</span><span>{event.severity}</span><span>{event.eventType}</span><span>{event.status}</span><span>{event.ownerOrganisation}</span></div><p>{event.riskTheme} · Net exposure {money(event.netAmountUsd)}</p></li>)}</ol> : <div className={styles.empty}><CalendarDays size={24} /><p>No events occurred in this selected scope.</p><button onClick={() => { setFilters(initialFilters); selectPeriod(''); }}>Reset filters</button></div>}
        <div className={styles.footer}><span>{records.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, records.length)} of {count(records.length)} records</span><div className={styles.pager}><button disabled={currentPage <= 1} aria-label="Previous events page" onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={14} /></button><span>Page {currentPage} of {pages}</span><button disabled={currentPage >= pages} aria-label="Next events page" onClick={() => setPage(value => value + 1)}><ChevronRight size={14} /></button></div></div>
      </section>
      <details className={styles.method}><summary>Source and calculation notes</summary><p>All {count(source.totalRows)} source records come from the canonical operational backend. Date filters use occurrence date inclusively. Monthly counts reconcile to the filtered record population, including zero-event calendar months. The period selector narrows the summary and event list; the chart retains the full filter scope for comparison. Null financial amounts remain not applicable. This timeline describes synthetic data.</p></details>
    </>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="event-detail-title" onCancel={() => setActive(null)} onClick={event => { if (event.target === event.currentTarget) setActive(null); }}>
      {active && <><div className={styles.dialogHead}><div><p>Source record · {active.eventId}</p><h2 id="event-detail-title">{active.title}</h2></div><button onClick={() => setActive(null)} aria-label="Close event details"><X size={18} /></button></div><dl className={styles.detail}>{[
        ['Occurrence date', active.occurrenceDate], ['Organisation', active.ownerOrganisation], ['Severity', active.severity], ['Event type', active.eventType], ['Workflow status', active.status], ['Stage', active.stage], ['Risk theme', active.riskTheme], ['Root cause', active.rootCause], ['Gross exposure', money(active.grossAmountUsd)], ['Net exposure', money(active.netAmountUsd)], ['Recovery amount', money(active.recoveryAmountUsd)], ['Potential impact', money(active.potentialImpactUsd)], ['Remediation effort', `${count(active.remediationHours)} hours`],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}<div className={styles.full}><dt>Description</dt><dd>{active.description || 'Not recorded'}</dd></div><div className={styles.full}><dt>Issue detail</dt><dd>{active.issueDetail || 'Not recorded'}</dd></div></dl></>}
    </dialog>
  </main>;
}
