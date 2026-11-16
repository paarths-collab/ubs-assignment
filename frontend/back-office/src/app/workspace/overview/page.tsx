"use client";

import { ConnectedTools } from "@/components/connected-tools";
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Database, FileSpreadsheet, LoaderCircle, ShieldCheck, Table2 } from 'lucide-react';
import styles from '../../overview/overview.module.css';
import local from './workspace.module.css';
import { count, filterSource, initialFilters, money, monthlyCounts, operational, type Filters, type Metadata, type Overview, type Source } from './data';

const colors = ['#f47e54', '#f6a176', '#fbd9bf', '#d6aa8d'];
function Ring({ values, label, center }: { values: [string, number][]; label: string; center: string }) {
  const total = values.reduce((sum, [, value]) => sum + value, 0);
  return <><div className={styles.donut}><svg viewBox="0 0 180 180" role="img" aria-label={values.map(([key, value]) => `${key}: ${count(value)}`).join(', ')}><circle cx="90" cy="90" r="61" fill="none" stroke="var(--raised)" strokeWidth="27" />{values.map(([key, value], index) => { const fraction = total ? value / total * 100 : 0; const start = total ? values.slice(0, index).reduce((sum, [, amount]) => sum + amount, 0) / total * 100 : 0; return <circle key={key} cx="90" cy="90" r="61" pathLength="100" fill="none" stroke={colors[index % colors.length]} strokeWidth="27" strokeDasharray={`${fraction} ${100 - fraction}`} strokeDashoffset={-start} transform="rotate(-90 90 90)"><title>{key}: {count(value)}</title></circle>; })}</svg><div><strong>{center}</strong><span>{label}</span></div></div><div className={styles.allocationLegend}>{values.map(([key, value], index) => <div key={key}><i style={{ background: colors[index % colors.length] }} /><span>{key}</span><strong>{count(value)}</strong></div>)}</div></>;
}
function Bars({ values }: { values: [string, number][] }) {
  const max = Math.max(1, ...values.map(([, value]) => value));
  return <div className={local.profile}>{values.map(([label, value]) => <div key={label}><span title={label}>{label}</span><span className={local.track}><i style={{ width: `${value / max * 100}%` }} /></span><span>{count(value)}</span></div>)}</div>;
}
export default function OverviewPage() {
  const [source, setSource] = useState<Source | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [snapshot, setSnapshot] = useState<{ key: string; data: Overview } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify(filters);
  const invalidDates = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([operational<Source>('source-events', controller.signal), operational<Metadata>('metadata', controller.signal)]).then(([events, meta]) => { setSource(events); setMetadata(meta); }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The source could not be loaded.'); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (invalidDates) return;
    const controller = new AbortController();
    operational<Overview>('overview', controller.signal, { filters: JSON.parse(key) }).then(data => setSnapshot({ key, data })).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The summary could not be loaded.'); });
    return () => controller.abort();
  }, [key, retry, invalidDates]);
  const rows = useMemo(() => filterSource(source?.events ?? [], filters), [source, filters]);
  const months = useMemo(() => monthlyCounts(rows), [rows]);
  const overview = snapshot?.key === key && !invalidDates ? snapshot.data : null;
  const loading = !source || !overview;
  const maxMonth = Math.max(1, ...months.map(month => month.value));
  const monthly = months.length > 12 ? months.slice(-12) : months;
  const grossByMonth = useMemo(() => {
    const grouped = new Map<string, number>();
    rows.forEach(row => { if (row.grossAmountUsd !== null) { const month = row.occurrenceDate.slice(0, 7); grouped.set(month, (grouped.get(month) ?? 0) + row.grossAmountUsd); } });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);
  const lineMax = Math.max(1, ...grossByMonth.map(([, value]) => value));
  const line = grossByMonth.map(([, value], index) => `${index ? 'L' : 'M'}${20 + index / Math.max(1, grossByMonth.length - 1) * 360},${150 - value / lineMax * 125}`).join(' ');
  const validCore = rows.filter(row => row.eventId && row.title && row.occurrenceDate && row.severity && row.ownerOrganisation).length;
  const completePercent = rows.length ? validCore / rows.length * 100 : null;
  function change(name: keyof Filters, value: string) { setError(''); setFilters(previous => ({ ...previous, [name]: value || undefined })); }
  return <main id="main" className={`${styles.overview} ${local.page}`}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>YOUR ANALYTICAL WORKSPACE</span><h1>Overview</h1><p>Explore operational events, exposure, and the patterns in your source.</p></div><Link className={styles.uploadButton} href="/workspace/datasets"><Table2 size={14} /> View records</Link></div>
    <div className={`${styles.toolbar} ${local.toolbar}`} aria-label="Analysis filters"><span className={styles.sourceBadge}><Database size={11} /> Synthetic operational events</span>
      <label>Organisation<select value={filters.organisation} onChange={event => change('organisation', event.target.value)}><option>Enterprise-wide</option>{metadata?.organisations.filter(item => item !== 'Enterprise-wide').map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Severity<select value={filters.severity} onChange={event => change('severity', event.target.value)}>{['All', 'Low', 'Moderate', 'High'].map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Type<select value={filters.eventType} onChange={event => change('eventType', event.target.value)}>{['All', 'Financial', 'Non-Financial'].map(item => <option key={item}>{item}</option>)}</select></label>
      <label>From<input type="date" value={filters.dateFrom ?? ''} min={metadata?.dateRange.min} max={metadata?.dateRange.max} onChange={event => change('dateFrom', event.target.value)} /></label><label>To<input type="date" value={filters.dateTo ?? ''} min={metadata?.dateRange.min} max={metadata?.dateRange.max} onChange={event => change('dateTo', event.target.value)} /></label><button onClick={() => { setFilters(initialFilters); setError(''); }}>Reset</button>
    </div>
    {invalidDates && <p className={styles.error} role="alert">Choose an end date on or after the start date.</p>}
    {error && <div className={styles.error} role="alert">{error} <button className={local.retry} onClick={() => { setError(''); setRetry(value => value + 1); }}>Retry</button></div>}
    {loading ? !error && !invalidDates && <div className={styles.loading} role="status"><LoaderCircle className={styles.spinner} size={22} /> Loading analysis from the source…</div> : <>
      <div className={styles.workspaceMetrics}>{[
        ['Events in scope', count(overview.eventCount), `${count(overview.datasetEventCount)} records in the source`],
        ['Open backlog', count(overview.composition.workflow.open), `${count(overview.composition.workflow.highStillOpen)} high-severity events still open`],
        ['Gross exposure', money(overview.exposure.realised.grossAmountUsd, true), 'Realised financial losses · USD'],
        ['Potential impact', money(overview.exposure.potential.totalUsd, true), 'Forward-looking exposure · USD'],
      ].map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
      {rows.length !== overview.eventCount && <p className={local.warning} role="status">The source and summary contain different record counts. Reload to refresh both snapshots.</p>}
      <ConnectedTools />
      <div className={`${styles.bento} ${local.charts}`}>
        <section className={`${styles.card} ${local.chart}`}><div className={styles.cardHeading}><h2>Event activity</h2><Database size={15} /></div><p className={styles.cardSubtitle}>Recorded events by occurrence month</p>{monthly.length ? <div className={`${styles.barChart} ${local.bars}`}>{monthly.map(({ month, value }) => <div key={month}><button title={`${month}: ${count(value)} events. Filter to this month.`} aria-label={`${month}: ${count(value)} events. Filter to this month.`} style={{ height: `${value / maxMonth * 100}%` }} onClick={() => { const [year, monthNumber] = month.split('-').map(Number); change('dateFrom', `${month}-01`); change('dateTo', `${month}-${new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()}`); }}><span className={styles.barValue}>{count(value)}</span></button><span>{new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</span></div>)}</div> : <div className={local.empty}>No events in this scope</div>}<p className={local.note}>{months.length > 12 ? 'Showing the latest 12 recorded months. ' : ''}Select a bar to inspect that month.</p></section>
        <section className={`${styles.card} ${local.chart}`}><div className={styles.cardHeading}><h2>Severity distribution</h2></div><p className={styles.cardSubtitle}>The selected event population</p><Ring values={['High', 'Moderate', 'Low'].map(name => [name, overview.composition.severity[name] ?? 0])} center={count(overview.eventCount)} label="events in scope" /></section>
        <section className={`${styles.card} ${local.chart}`}><div className={styles.cardHeading}><h2>Source completeness</h2><ShieldCheck size={15} /></div><p className={styles.cardSubtitle}>Five core fields checked across selected records</p><Ring values={[["Complete records", validCore], ['Missing core fields', rows.length - validCore]]} center={completePercent === null ? '—' : `${completePercent.toFixed(0)}%`} label="core field coverage" /><p className={local.note}>ID, title, date, severity, organisation. Financial nulls can be valid and are not treated as missing core fields.</p></section>
        <section className={`${styles.card} ${local.chart}`}><div className={styles.cardHeading}><h2>Gross loss over time</h2></div><p className={styles.cardSubtitle}>Monthly realised financial exposure · USD</p>{grossByMonth.length ? <><svg className={local.line} viewBox="0 0 400 180" role="img" aria-label={grossByMonth.map(([month, amount]) => `${month}: ${money(amount)}`).join('; ')}>{[25, 88, 150].map(y => <line key={y} x1="20" x2="380" y1={y} y2={y} stroke="var(--border)" />)}<path d={`${line} L380,150 L20,150 Z`} fill="#f6a176" opacity=".13" /><path d={line} fill="none" stroke="#ed936c" strokeWidth="2" />{grossByMonth.map(([month, amount], index) => <circle key={month} cx={20 + index / Math.max(1, grossByMonth.length - 1) * 360} cy={150 - amount / lineMax * 125} r="4" fill="#ed936c"><title>{month}: {money(amount)}</title></circle>)}</svg><div className={local.legend}><span>{grossByMonth[0][0]}</span><span>Peak {money(lineMax, true)}</span><span>{grossByMonth[grossByMonth.length - 1][0]}</span></div></> : <div className={local.empty}>No applicable financial amounts</div>}<p className={local.note}>Net exposure {money(overview.exposure.realised.netAmountUsd)} · recovered {money(overview.exposure.realised.recoveryAmountUsd)}.</p></section>
        <section className={`${styles.card} ${local.chart}`}><div className={styles.cardHeading}><h2>Workflow profile</h2></div><p className={styles.cardSubtitle}>Current resolution status across selected records</p><Bars values={[["Open", overview.composition.workflow.open], ['Closed', overview.composition.workflow.closed], ['Cancelled', overview.composition.workflow.cancelled]]} /><div className={local.stat}>{count(overview.exposure.operational.totalRemediationHours)} <small>hours</small></div><p className={local.note}>Recorded remediation effort · {overview.exposure.operational.averagePerEvent.toLocaleString('en-US')} hours per event.</p></section>
        <section className={`${styles.card} ${local.chart}`}><div className={styles.cardHeading}><h2>Organisation mix</h2></div><p className={styles.cardSubtitle}>Largest teams by selected event count</p><Bars values={[...overview.composition.organisations].sort((a, b) => b.eventCount - a.eventCount).slice(0, 6).map(row => [row.key, row.eventCount])} /><p className={local.note}>Showing up to six organisations. Filter above to explore each team.</p></section>
      </div>
      <section className={styles.sourceCard}><div className={styles.sourceRow}><span className={styles.fileIcon}><FileSpreadsheet size={21} /></span><div className={styles.fileName}><strong>Operational events</strong><span>Synthetic source · canonical backend records · {count(source.totalRows)} rows</span></div><Link href="/workspace/datasets">Inspect the source <ArrowUpRight size={14} /></Link></div></section>
      <div className={styles.methodNote}><span>Connected to the operational analysis backend</span><details><summary>How these charts are calculated</summary><p>Overview metrics use the backend filtering and exposure rules. Activity, monthly gross losses, and core-field completeness are calculated from canonical source records using the same organisation, date, event type, and severity filters. Loss amounts describe financial exposure, not revenue. Null amounts remain not applicable. Data is synthetic.</p></details></div>
    </>}
  </main>;
}
