"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Database, FileSpreadsheet, LoaderCircle, Search, ShieldCheck, Table2, X } from 'lucide-react';
import styles from '../../datasets/datasets.module.css';
import local from './workspace.module.css';
import { count, money, operational, type Source, type SourceEvent } from '../overview/data';
const PAGE_SIZE = 20;
export default function DatasetsPage() {
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('All');
  const [kind, setKind] = useState('All');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<SourceEvent | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    operational<Source>('source-events', controller.signal).then(setSource).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The source could not be loaded.'); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => { if (active) dialog.current?.showModal(); else dialog.current?.close(); }, [active]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (source?.events ?? []).filter(event => (severity === 'All' || event.severity === severity) && (kind === 'All' || event.eventType === kind) && (!query || [event.eventId, event.title, event.ownerOrganisation, event.riskTheme, event.rootCause].some(value => value.toLocaleLowerCase().includes(query))));
  }, [source, search, severity, kind]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const organisations = new Set(source?.events.map(event => event.ownerOrganisation) ?? []).size;
  const uniqueIds = new Set(source?.events.map(event => event.eventId) ?? []).size;
  const complete = source?.events.filter(event => event.eventId && event.title && event.occurrenceDate && event.severity && event.ownerOrganisation).length ?? 0;
  return <main id="main" className={`${styles.page} ${local.page}`}>
    <div className={styles.breadcrumb}><Link href="/workspace/overview">Workspace</Link><ChevronRight size={12} /><span>Datasets</span></div>
    <div className={styles.heading}><div><h1>Datasets</h1><p>The source behind your analysis. Inspect canonical records and understand their fields.</p></div><Link className={styles.primaryButton} href="/workspace/overview">Explore analysis <ArrowUpRight size={14} /></Link></div>
    {error && <div role="alert" className={local.error}>{error} <button onClick={() => { setError(''); setRetry(value => value + 1); }}>Retry</button></div>}
    <div className={`${styles.metrics} ${local.metrics}`}><div className={styles.metric}><div className={styles.metricTop}><span>Connected source</span><Database size={16} /></div><strong>{source ? '1' : '—'}</strong><div className={styles.metricBottom}>Canonical operational event dataset</div></div><div className={styles.metric}><div className={styles.metricTop}><span>Source records</span><Table2 size={16} /></div><strong>{source ? count(source.totalRows) : '—'}</strong><div className={styles.metricBottom}>All records available for inspection</div></div><div className={styles.metric}><div className={styles.metricTop}><span>Organisations represented</span><ShieldCheck size={16} /></div><strong>{source ? count(organisations) : '—'}</strong><div className={styles.metricBottom}>Derived from source ownership fields</div></div></div>
    <div className={`${styles.libraryLayout} ${local.layout}`}>
      <section className={styles.library} aria-label="Canonical event records"><div className={styles.libraryHeading}><div><h2>Operational events <span>{source ? count(source.totalRows) : '…'}</span></h2><p>Synthetic data · read-only source · original values preserved</p></div><FileSpreadsheet size={20} /></div>
        <div className={`${styles.toolbar} ${local.filters}`}><label className={styles.search}><Search size={15} /><input aria-label="Search records" value={search} placeholder="Search ID, title, team, or theme…" onChange={event => { setSearch(event.target.value); setPage(1); }} /></label><select aria-label="Filter by severity" value={severity} onChange={event => { setSeverity(event.target.value); setPage(1); }}>{['All', 'High', 'Moderate', 'Low'].map(value => <option key={value} value={value}>{value === 'All' ? 'All severities' : value}</option>)}</select><select aria-label="Filter by event type" value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}>{['All', 'Financial', 'Non-Financial'].map(value => <option key={value} value={value}>{value === 'All' ? 'All event types' : value}</option>)}</select></div>
        {!source ? <div className={styles.empty} role="status"><LoaderCircle size={24} className={styles.spinner} /><h3>{error ? 'Source unavailable' : 'Loading source records'}</h3><p>{error ? 'Retry the source request above.' : 'Retrieving canonical events from the analysis backend…'}</p></div> : filtered.length === 0 ? <div className={styles.empty}><Search size={24} /><h3>No matching records</h3><p>Try a different title, team, event type, or severity.</p><button onClick={() => { setSearch(''); setSeverity('All'); setKind('All'); setPage(1); }}>Reset filters</button></div> : <div className={styles.tableScroll} tabIndex={0} aria-label="Event records, scroll horizontally for more fields"><table className={`${styles.datasetTable} ${local.table}`}><thead><tr><th>Event</th><th>Occurrence</th><th>Severity</th><th>Type</th><th>Status</th><th>Net exposure</th><th>Record</th></tr></thead><tbody>{visible.map(event => <tr key={event.eventId}><td><button className={styles.datasetName} onClick={() => setActive(event)}><span className={styles.fileIcon}><FileSpreadsheet size={18} /></span><span><strong title={event.title}>{event.title}</strong><small>{event.eventId} · {event.ownerOrganisation}</small></span></button></td><td>{event.occurrenceDate}</td><td><span className={`${local.status} ${event.severity === 'High' ? local.high : ''}`}>{event.severity}</span></td><td>{event.eventType}</td><td>{event.status}</td><td className={styles.numberCell}>{money(event.netAmountUsd)}</td><td><button aria-label={`View record ${event.eventId}`} onClick={() => setActive(event)}>View <ArrowUpRight size={13} /></button></td></tr>)}</tbody></table></div>}
        <div className={`${styles.libraryFooter} ${local.footer}`}><span aria-live="polite">{source ? `${filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${count(filtered.length)} matching records` : 'Waiting for source…'}</span><div className={local.pagination}><button disabled={currentPage <= 1} aria-label="Previous records page" onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={14} /></button><span>Page {currentPage} of {pages}</span><button disabled={currentPage >= pages} aria-label="Next records page" onClick={() => setPage(value => value + 1)}><ChevronRight size={14} /></button></div></div>
      </section>
      <aside className={`${styles.aside} ${local.aside}`}><section className={styles.sampleCard}><div className={styles.sampleIcon}><Database size={17} /></div><h3>A clear view of the source</h3><p>Explore event activity, severity, workflow, and financial exposure using the same records.</p><svg className={local.sourceArt} viewBox="0 0 220 140" role="img" aria-label="Illustration of connected data records, not an analytical chart"><rect x="10" y="15" width="200" height="112" rx="10" fill="var(--raised)" stroke="var(--border)" />{[36, 61, 86, 111].map((y, index) => <g key={y}><rect x="27" y={y - 7} width="13" height="13" rx="3" fill="#f6a176" opacity={1 - index * .15} /><line x1="51" y1={y} x2="127" y2={y} stroke="var(--secondary)" opacity=".3" strokeWidth="4" strokeLinecap="round" /><line x1="153" y1={y} x2="189" y2={y} stroke="#f6a176" opacity=".7" strokeWidth="4" strokeLinecap="round" /></g>)}</svg><Link className={local.sideLink} href="/workspace/overview">View the analysis <ArrowRight size={14} /></Link></section><section id="source-health" className={styles.sampleCard} aria-labelledby="source-profile-title"><div className={styles.sampleIcon}><ShieldCheck size={17} /></div><h3 id="source-profile-title">Source profile</h3><p>{source ? `${count(complete)} of ${count(source.events.length)} records have all five core fields: ID, title, date, severity, and organisation.` : 'The source profile will appear after records load.'}</p><p>{source ? `${count(source.events.length - uniqueIds)} duplicate event IDs detected.` : 'Duplicate ID checks use the complete source.'}</p><span className={local.sourceNote}>Null financial values can mean an amount is not applicable. This source uses synthetic operational data; no uploads or mutations are made here.</span></section></aside>
    </div>
    <dialog ref={dialog} className={`${styles.dialog} ${local.dialog}`} aria-labelledby="record-title" onCancel={() => setActive(null)} onClick={event => { if (event.target === event.currentTarget) setActive(null); }}>
      {active && <><div className={styles.dialogHeader}><div className={styles.dialogTitle}><span className={styles.fileIcon}><FileSpreadsheet size={20} /></span><div><p>Canonical source record · {active.eventId}</p><h2 id="record-title">{active.title}</h2></div></div><button className={styles.iconButton} onClick={() => setActive(null)} aria-label="Close record inspector"><X size={19} /></button></div><dl className={local.record}>{[
        ['Occurrence date', active.occurrenceDate], ['Organisation', active.ownerOrganisation], ['Event type', active.eventType], ['Severity', active.severity], ['Status', active.status], ['Stage', active.stage], ['Risk theme', active.riskTheme], ['Root cause', active.rootCause], ['Gross exposure', money(active.grossAmountUsd)], ['Net exposure', money(active.netAmountUsd)], ['Recovery', money(active.recoveryAmountUsd)], ['Potential impact', money(active.potentialImpactUsd)], ['Remediation', `${count(active.remediationHours)} hours`],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}<div className={local.narrative}><dt>Description</dt><dd>{active.description || 'Not recorded'}</dd></div><div className={local.narrative}><dt>Issue detail</dt><dd>{active.issueDetail || 'Not recorded'}</dd></div></dl><div className={styles.dialogFooter}><span><ShieldCheck size={13} /> Original data is preserved</span><button onClick={() => setActive(null)}>Close inspector</button></div></>}
    </dialog>
  </main>;
}
