"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, Database, LoaderCircle, RefreshCw, X } from "lucide-react";
import { count, decimal, money, selectionPath, useEvidence, type Investigation, type IssueDetailResponse, type RiskEvent, type Selection, type TriggeredSignal, type CounterSignal } from "./data";
import styles from "./issues.module.css";

type Detail = IssueDetailResponse | Investigation | RiskEvent;
function Signals({ signals, counter = false }: { signals: (TriggeredSignal | CounterSignal)[]; counter?: boolean }) {
  return <section className={styles.section}><h3>{counter ? "What weakens the case" : "Why it requires attention"}</h3>{signals.length ? <ul className={styles.signals}>{signals.map(signal => <li key={signal.id}><div><strong>{signal.label}</strong>{"weight" in signal && <span>Weight {signal.weight} · {signal.tier}</span>}</div><p>{signal.detail}</p></li>)}</ul> : <p className={styles.muted}>No {counter ? "counter-signals" : "triggered signals"} supplied for this issue.</p>}</section>;
}
function Metrics({ rows }: { rows: [string, string][] }) {
  return <dl className={styles.detailMetrics}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function EvidenceIds({ ids, open }: { ids: string[]; open: (selection: Selection) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = ids.filter(id => id.toLowerCase().includes(search.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const current = Math.min(page, pages);
  return <section className={styles.section}><h3>Source event evidence <span>{count(ids.length)}</span></h3><p>Open a source ID to inspect its recorded status, financial fields, and narrative.</p><label className={styles.evidenceSearch}>Find an event ID<input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search source IDs…" /></label><div className={styles.ids}>{filtered.slice((current - 1) * 30, current * 30).map(id => <button key={id} onClick={() => open({ kind: "event", id })}>{id}<ArrowUpRight size={11} aria-hidden="true" /></button>)}</div>{!filtered.length && <p>No IDs match this search.</p>}{pages > 1 && <div className={styles.pagination}><button disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current} of {pages}</span><button disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div>}</section>;
}

function IssueEvidence({ detail, open }: { detail: IssueDetailResponse; open: (selection: Selection) => void }) {
  const p = detail.profile;
  return <>
    <p className={styles.summary}>{detail.deterministicSummary}</p>
    <Metrics rows={[["Matching events", count(p.severity.event_count)], ["High severity", `${decimal(p.severity.high_rate_pct)}% · ${count(p.severity.high_count)} events`], ["High-rate concentration", `${decimal(p.severity.high_rate_lift, 2)}× baseline`], ["Open workload", `${count(p.openWorkload.open_events)} · ${decimal(p.openWorkload.open_rate_pct)}%`]]} />
    <div className={styles.detailGrid}><Signals signals={p.triggeredSignals} /><Signals signals={p.counterSignals} counter /></div>
    <p className={styles.method}>Ranking weight {p.rankScore} is the sum of the named signals above. It orders the issues; it is not an AI risk prediction.</p>
    <section className={styles.section}><h3>Financial evidence · USD</h3><div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Issue financial evidence"><table><thead><tr><th>Measure</th><th>Total</th><th>Populated records</th></tr></thead><tbody>{([['Gross exposure', p.financials.gross_amount], ['Net exposure', p.financials.net_amount], ['Recovery', p.financials.recovery_amount], ['Potential impact', p.financials.potential_impact]] as const).map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{money(value.total)}</td><td>{value.populated_count} of {value.event_count}</td></tr>)}</tbody></table></div><p>Missing amounts are excluded, not treated as zero. Potential impact is separate from realised exposure.</p></section>
    <section className={styles.section}><h3>Root-cause combinations</h3><div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Root-cause evidence"><table><thead><tr><th>Root cause</th><th>Events</th><th>High rate</th><th>Concentration</th><th>Support</th></tr></thead><tbody>{p.rootCauseBreakdown.map(row => <tr key={row.root_cause}><th scope="row">{row.root_cause}</th><td>{row.event_count}</td><td>{decimal(row.high_rate_pct)}%</td><td>{decimal(row.high_rate_lift, 2)}×</td><td>{row.meets_support_threshold ? "Meets threshold" : "Below support threshold"}</td></tr>)}</tbody></table></div></section>
    <section className={styles.section}><h3>Organisation evidence</h3><div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Organisation evidence"><table><thead><tr><th>Organisation</th><th>Events</th><th>High severity</th><th>High rate</th><th>Sample note</th></tr></thead><tbody>{p.organisationBreakdown.map(row => <tr key={row.organisation}><th scope="row">{row.organisation}</th><td>{row.event_count}</td><td>{row.high_count}</td><td>{decimal(row.high_rate_pct)}%</td><td>{row.small_sample ? "Small sample; interpret cautiously" : "Threshold met"}</td></tr>)}</tbody></table></div></section>
    <div className={styles.detailGrid}><section className={styles.section}><h3>Timeliness · mean days</h3><dl className={styles.facts}>{([['Detection', p.timeliness.detection_delay], ['Recording', p.timeliness.recording_delay], ['Occurrence to record', p.timeliness.occurrence_to_record]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{decimal(value.mean_days)} <small>· baseline {decimal(value.enterprise_mean_days)}</small></dd></div>)}</dl></section><section className={styles.section}><h3>Recorded trend</h3><p>{p.trend.note}</p><p>{p.trend.prior.start_month}–{p.trend.prior.end_month}: {p.trend.prior.event_count} events<br />{p.trend.recent.start_month}–{p.trend.recent.end_month}: {p.trend.recent.event_count} events</p></section></div>
    <section className={styles.section}><h3>Related pattern evidence</h3><div className={styles.related}>{p.relatedPatterns.map(pattern => <button key={pattern.pattern_id} onClick={() => open({ kind: "pattern", id: pattern.pattern_id })}><span><strong>{pattern.title}</strong><small>{pattern.pattern_id} · {pattern.priority_level}</small></span><ChevronRight size={15} aria-hidden="true" /></button>)}</div>{!p.relatedPatterns.length && <p>No related patterns supplied.</p>}</section>
    <EvidenceIds key={p.slug} ids={p.matchingEventIds} open={open} />
    <p className={styles.method}>Compared with {count(detail.enterprise.event_count)} source events; enterprise high-severity rate {decimal(detail.enterprise.high_rate_pct)}%. Descriptive concentrations do not establish causation.</p>
  </>;
}

function PatternEvidence({ detail, open }: { detail: Investigation; open: (selection: Selection) => void }) {
  const p = detail.pattern;
  const o = p.observed;
  return <>
    <p className={styles.summary}>{detail.deterministicSummary}</p>
    <div className={styles.tags}><span>{p.priority_level} priority</span><span>{p.pattern_type.replaceAll('_', ' ')}</span><span>{p.pattern_id}</span></div>
    <Metrics rows={[["Matching events", count(o.event_count)], ["High severity", `${decimal(o.high_rate_pct)}%`], ["High-rate concentration", `${decimal(o.high_rate_lift, 2)}× baseline`], ["Open events", `${count(o.open_events)} · ${decimal(o.open_rate * 100)}%`]]} />
    <section className={styles.section}><h3>Why this pattern surfaced</h3><p>{p.why_seen}</p><ul className={styles.reasons}>{p.priority_reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul><dl className={styles.facts}>{Object.entries(p.dimensions).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{value}</dd></div>)}</dl></section>
    <div className={styles.detailGrid}><section className={styles.section}><h3>Stored financial statistics · USD</h3><dl className={styles.facts}>{[['Gross exposure', money(o.gross_amount)], ['Net exposure', money(o.net_amount)], ['Recovery', money(o.recovery_amount)], ['Potential impact', money(o.potential_impact)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>These are stored pattern aggregates. Inspect individual events for reported and derived amounts; potential impact remains separate.</p></section><section className={styles.section}><h3>Compared with the source baseline</h3><dl className={styles.facts}>{[['High-rate change', `${decimal(detail.enterpriseComparison.high_rate_delta_pct_points)} percentage points`], ['Detection delay change', `${decimal(detail.enterpriseComparison.detection_delay_delta_days)} days`], ['Recording delay change', `${decimal(detail.enterpriseComparison.recording_delay_delta_days)} days`], ['Occurrence-to-record change', `${decimal(detail.enterpriseComparison.occurrence_to_record_delta_days)} days`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section></div>
    <section className={styles.section}><h3>Recorded status of matching events</h3><div className={styles.eventList}>{detail.matchingEvents.slice(0, 8).map(event => <button key={event.event_id} onClick={() => open({ kind: "event", id: event.event_id })}><span><strong>{event.title}</strong><small>{event.event_id} · {event.classification} · {event.workflow.status}</small></span><ArrowUpRight size={14} aria-hidden="true" /></button>)}</div><p>Showing {Math.min(8, detail.matchingEvents.length)} of {detail.matchingEvents.length} resolved records. All supplied IDs are available below.</p></section>
    <EvidenceIds key={p.pattern_id} ids={p.matching_event_ids} open={open} />
    <p className={styles.method}>Stored patterns can overlap; their event counts must not be added together. Baseline: {count(detail.enterprise.event_count)} synthetic source events. This is descriptive evidence, not an AI prediction.</p>
  </>;
}

function EventEvidence({ event }: { event: RiskEvent }) {
  return <>
    <div className={styles.tags}><span>{event.event_id}</span><span>{event.event_type}</span><span>{event.classification} severity</span><span>{event.workflow.status}</span></div>
    <Metrics rows={[["Recorded status", event.workflow.status], ["Workflow stage", event.workflow.stage], ["Occurrence", event.timeline.occurrence_date], ["Backlog classification", event.workflow.is_open ? "Open" : "Not open"]]} />
    <div className={styles.detailGrid}><section className={styles.section}><h3>Source context</h3><dl className={styles.facts}>{[['Issue', event.issue], ['Organisation', event.workflow.owner_organisation], ['Root cause', event.risk.root_cause], ['Risk theme', event.risk.risk_theme], ['Category', event.risk.or_category]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>)}</dl></section><section className={styles.section}><h3>Financial values · USD</h3><dl className={styles.facts}>{[['Gross amount', money(event.financial.gross_amount)], ['Net · reported', money(event.financial.net_amount_reported)], ['Net · analysis', money(event.financial.net_amount_for_analysis)], ['Recovery · reported', money(event.financial.recovery_amount_reported)], ['Recovery · analysis', money(event.financial.recovery_amount_for_analysis)], ['Potential impact', money(event.financial.potential_impact)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section></div>
    <section className={styles.section}><h3>Recorded narrative</h3>{[['Background', event.narrative.background_detail], ['Issue detail', event.narrative.issue_detail], ['Root-cause detail', event.narrative.root_cause_detail], ['Impact detail', event.narrative.impact_detail], ['Opportunity', event.narrative.opportunity]].map(([label, value]) => <div className={styles.narrative} key={label}><h4>{label}</h4><p>{value || "Not recorded"}</p></div>)}</section>
    <p className={styles.method}>Source narrative is preserved as recorded. It is not a verified financial calculation or an AI-generated answer. Analysis amounts may be derived by the backend where the original reported value is missing.</p>
  </>;
}

export function EvidenceDialog({ selection, canGoBack, open, back, close }: { selection: Selection; canGoBack: boolean; open: (selection: Selection) => void; back: () => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [attempt, setAttempt] = useState(0);
  const result = useEvidence<Detail>(selectionPath(selection), attempt);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); dialog.current?.scrollTo({ top: 0 }); }, [selection.kind, selection.id]);
  const title = result.data ? selection.kind === "issue" ? (result.data as IssueDetailResponse).profile.issue : selection.kind === "pattern" ? (result.data as Investigation).pattern.title : (result.data as RiskEvent).title : `${selection.kind === "issue" ? "Issue" : selection.kind === "pattern" ? "Pattern" : "Event"} evidence`;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="issue-evidence-title" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <header className={styles.dialogHeader}><div><span><Database size={12} aria-hidden="true" />Synthetic source evidence</span><h2 id="issue-evidence-title" ref={heading} tabIndex={-1}>{title}</h2><small>{selection.id}</small></div><button className={styles.iconButton} onClick={close} aria-label="Close evidence"><X size={18} aria-hidden="true" /></button></header>
    <div className={styles.dialogBody}>{canGoBack && <button className={styles.back} onClick={back}><ArrowLeft size={13} aria-hidden="true" />Back to previous evidence</button>}{result.loading ? <div className={styles.state} role="status"><LoaderCircle className={styles.spinner} size={20} aria-hidden="true" />Loading source evidence…</div> : result.error ? <div className={styles.state} role="alert"><h3>Evidence could not be loaded</h3><p>{result.error}</p><button onClick={() => setAttempt(value => value + 1)}><RefreshCw size={13} aria-hidden="true" />Retry evidence</button></div> : result.data ? selection.kind === "issue" ? <IssueEvidence detail={result.data as IssueDetailResponse} open={open} /> : selection.kind === "pattern" ? <PatternEvidence detail={result.data as Investigation} open={open} /> : <EventEvidence event={result.data as RiskEvent} /> : null}</div>
    <footer className={styles.dialogFooter}><span>Source: issue and pattern dataset</span><button onClick={close}>Close evidence</button></footer>
  </dialog>;
}
