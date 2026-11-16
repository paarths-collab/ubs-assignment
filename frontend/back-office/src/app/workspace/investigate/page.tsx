"use client";
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Fingerprint, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { AnalysisEvidence } from '@/components/analysis-evidence';
import { count, initialFilters, money, operational, type Filters, type Metadata } from '../overview/data';
import { searchSignals, selectionFor, type ScenarioSignal, type Signals, type RiskDetailResponse } from './data';
import { SelectionAnalysis } from './selection-analysis';
import styles from './investigate.module.css';

type Health = { aiConfigured: boolean };
type DetailState = {key:string; detail?:RiskDetailResponse; error?:string};
const tabs = ['Evidence','Breakdown','Next steps'] as const;

function DemoAction({signal}:{signal:ScenarioSignal}) {
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const controller=useRef<AbortController|null>(null);
  const pending=useRef(false);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  async function record(actionType:string) {
    if(pending.current)return;
    pending.current=true;setBusy(true);setMessage('');
    const active=new AbortController();controller.current=active;
    try {
      const result=await operational<{action:{actionId:string;status:string}}>('actions',active.signal,{actionType,eventIds:selectionFor(signal).eventIds,patternId:signal.patternId,note});
      if(!active.signal.aborted)setMessage(`Simulation recorded: ${result.action.actionId}. Status: ${result.action.status}. No external assignment or notification was made.`);
    }catch(err){if(!active.signal.aborted)setMessage(err instanceof Error?err.message:'Could not record simulation.');}
    finally{if(!active.signal.aborted){pending.current=false;setBusy(false);}}
  }
  return <section className={styles.actionForm}><h3>Try the review workflow</h3><p>These backend actions are simulations held in server memory. They do not assign people, notify anyone, or persist after a server restart.</p><label htmlFor="review-note">Review note (optional)</label><textarea id="review-note" className={styles.note} maxLength={2000} value={note} onChange={event=>setNote(event.target.value)} placeholder="Record what you want to check…"/><div className={styles.row}>{[['OPEN_INVESTIGATION','Simulate investigation'],['ASSIGN_REVIEW','Simulate review'],['ESCALATE','Simulate escalation']].map(([value,label])=><button key={value} disabled={busy} onClick={()=>void record(value)}>{label}</button>)}</div>{message&&<p role="status">{message}</p>}</section>;
}

export default function Investigate() {
  const [filters,setFilters]=useState<Filters>(initialFilters);
  const [draft,setDraft]=useState<Filters>(initialFilters);
  const [metadata,setMetadata]=useState<Metadata|null>(null);
  const [configured,setConfigured]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [dateError,setDateError]=useState('');
  const [tab,setTab]=useState<typeof tabs[number]>('Evidence');
  const [list,setList]=useState<{key:string;data?:Signals;error?:string}>({key:''});
  const [detail,setDetail]=useState<DetailState>({key:''});
  const [detailAttempt,setDetailAttempt]=useState(0);
  const key=JSON.stringify({filters,attempt});
  useEffect(()=>{
    const controller=new AbortController();
    operational<Metadata>('metadata',controller.signal).then(value=>{if(!controller.signal.aborted)setMetadata(value);}).catch(()=>{});
    operational<Health>('health',controller.signal).then(value=>{if(!controller.signal.aborted)setConfigured(value.aiConfigured);}).catch(()=>{if(!controller.signal.aborted)setConfigured(false);});
    operational<Signals>('priority-signals',controller.signal,{filters,limit:50}).then(data=>{
      if(controller.signal.aborted)return;
      setList({key,data});setSelectedId(data.items[0]?.scenarioId??'');
    }).catch(err=>{if(!controller.signal.aborted)setList({key,error:err instanceof Error?err.message:'Unable to load priorities.'});});
    return()=>controller.abort();
  },[filters,key]);
  const data=list.key===key?list.data:undefined;
  const error=list.key===key?list.error:undefined;
  const selected=data?.items.find(item=>item.scenarioId===selectedId);
  const selection=selected?selectionFor(selected):null;
  const detailKey=JSON.stringify({filters,selection,detailAttempt});
  useEffect(()=>{
    if(!selection?.eventIds.length)return;
    const controller=new AbortController();
    operational<{detail:RiskDetailResponse}>('risk-detail',controller.signal,{filters,selection}).then(result=>{if(!controller.signal.aborted)setDetail({key:detailKey,detail:result.detail});}).catch(err=>{if(!controller.signal.aborted)setDetail({key:detailKey,error:err instanceof Error?err.message:'Unable to load evidence.'});});
    return()=>controller.abort();
    // detailKey serializes both filters and exact event IDs; it is stable between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[detailKey]);
  const evidence=detail.key===detailKey?detail.detail:undefined;
  const detailError=detail.key===detailKey?detail.error:undefined;
  const visible=searchSignals(data?.items??[],query);
  function apply(event:FormEvent){event.preventDefault();const from=draft.dateFrom||metadata?.dateRange.min;const to=draft.dateTo||metadata?.dateRange.max;if(from&&to&&from>to){setDateError('End date must be on or after start date.');return;}setDateError('');setTab('Evidence');setFilters({...draft,dateFrom:draft.dateFrom||undefined,dateTo:draft.dateTo||undefined});}
  const rows=evidence?Object.entries(evidence.severity).map(([severity,events])=>({severity,events})):[];
  return <main id="main" className={styles.page}><header className={styles.header}><div><span className={styles.eyebrow}>EVIDENCE & INVESTIGATION</span><h1>Priority signals</h1><p>Follow the signals that deserve attention, then inspect the records behind them.</p></div><Link className={styles.button} href="/workspace/issues">Issue library<ArrowUpRight size={14}/></Link></header>
    <form className={styles.filters} onSubmit={apply}><label>Organisation<select value={draft.organisation} onChange={e=>setDraft({...draft,organisation:e.target.value})}>{[...new Set(['Enterprise-wide',...(metadata?.organisations??[])])].map(value=><option key={value}>{value}</option>)}</select></label><label>Event type<select value={draft.eventType} onChange={e=>setDraft({...draft,eventType:e.target.value})}>{['All','Financial','Non-Financial'].map(value=><option key={value}>{value}</option>)}</select></label><label>Severity<select value={draft.severity} onChange={e=>setDraft({...draft,severity:e.target.value})}>{['All','High','Moderate','Low'].map(value=><option key={value}>{value}</option>)}</select></label><label>From<input type="date" value={draft.dateFrom??''} onChange={e=>setDraft({...draft,dateFrom:e.target.value})}/></label><label>To<input type="date" value={draft.dateTo??''} onChange={e=>setDraft({...draft,dateTo:e.target.value})}/></label><button type="submit" className={styles.primary}>Apply scope</button><button type="button" onClick={()=>{setFilters(initialFilters);setDraft(initialFilters);setDateError('');}}>Reset</button></form>{dateError&&<p role="alert">{dateError}</p>}
    {!data&&!error&&<div className={styles.message} role="status">Loading computed priorities…</div>}{error&&<div className={styles.message} role="alert">{error}<br/><button onClick={()=>setAttempt(v=>v+1)}><RefreshCw size={13}/>Retry connection</button></div>}
    {data&&<div className={styles.grid}><aside className={styles.queue} aria-label="Priority queue"><div className={styles.row}><Fingerprint size={16}/><h2>Attention queue</h2></div><p>{count(data.totalCandidates)} candidates · {count(data.items.length)} shown<br/>Sorted by the backend’s evidence rules.</p><label className={styles.row}><Search size={14}/><input className={styles.search} aria-label="Search priority signals" placeholder="Search a signal…" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className={styles.queueList}>{visible.map(item=><button key={item.scenarioId} aria-pressed={item.scenarioId===selectedId} onClick={()=>{setSelectedId(item.scenarioId);setTab('Evidence');}}><span className={styles.badge}>{item.level}</span><strong>{item.title}</strong><small>{count(item.eventCount)} events · {count(item.openEventCount)} open</small></button>)}</div>{!visible.length&&<p>No matching signals. Broaden your scope or clear the search.</p>}<p className={styles.footnote}>Signals can overlap. Their counts should not be added together.</p></aside>
      <section className={`${styles.panel} ${styles.fade}`} aria-label="Selected signal">{!selected?<div className={styles.message}>No signals in this scope. Adjust the filters to explore the source.</div>:<><span className={styles.badge}>{selected.level} attention</span><h2>{selected.title}</h2><p>{selected.contextLine}</p><p>{selected.whyAttention}</p><div className={styles.summary}><div><small>Source events</small><strong>{count(selected.eventCount)}</strong></div><div><small>High severity</small><strong>{count(selected.highSeverityCount)}</strong></div><div><small>Net exposure · USD</small><strong>{money(selected.netAmountUsd,true)}</strong></div></div>
      <div className={styles.tabs} role="tablist" aria-label="Signal detail view">{tabs.map((value,index)=><button key={value} id={`signal-tab-${index}`} role="tab" aria-selected={tab===value} aria-controls="signal-panel" tabIndex={tab===value?0:-1} onClick={()=>setTab(value)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;setTab(tabs[next]);document.getElementById(`signal-tab-${next}`)?.focus();}}>{value}</button>)}</div>
      <div id="signal-panel" role="tabpanel" aria-labelledby={`signal-tab-${tabs.indexOf(tab)}`}>
      {tab==='Evidence'&&<><div className={styles.dimensions}>{selected.dimensions.map(dimension=><article className={styles.dimension} key={dimension.dimension}><span className={styles.eyebrow}>{dimension.dimension}</span><h3>{dimension.label}</h3><p>{dimension.detail}</p></article>)}</div>{!evidence&&!detailError&&<p role="status">Loading exact source evidence…</p>}{detailError&&<div role="alert"><p>{detailError}</p><button onClick={()=>setDetailAttempt(v=>v+1)}>Retry evidence</button></div>}{evidence&&<><h3><ShieldCheck size={14}/> Verified selection · {count(evidence.summary.eventCount)} events</h3><AnalysisEvidence table={{columns:['severity','events'],rows,returned_rows:rows.length,truncated:false}} charts={[{type:'bar',title:'Severity in this signal',x_label:'Severity',y_label:'Events',points:rows.map(row=>({x:row.severity,y:row.events})),caveats:[]}]} interactive/><details><summary>Source event IDs ({evidence.evidence.eventIds.length})</summary><div className={styles.ids}>{evidence.evidence.eventIds.map(id=><code key={id}>{id}</code>)}</div></details><p>{count(evidence.workflow.openEventCount)} open · {count(evidence.operationalImpact.remediationHours)} remediation hours · {money(evidence.financial.potentialImpactUsd)} potential impact.</p></>}</>}
      {tab==='Breakdown'&&<><h3>Organisation contribution</h3><div className={styles.table}><table><thead><tr><th>Organisation</th><th>Events</th><th>High severity</th><th>Open</th><th>Net USD</th></tr></thead><tbody>{selected.analytics.organisations.map(row=><tr key={row.key}><td>{row.key}</td><td>{count(row.eventCount)}</td><td>{count(row.highSeverityCount)}</td><td>{count(row.openEventCount)}</td><td>{money(row.netAmountUsd)}</td></tr>)}</tbody></table></div><h3>Workflow</h3><div className={styles.table}><table><thead><tr><th>Status</th><th>Events</th></tr></thead><tbody>{Object.entries(selected.analytics.workflow.statusCounts).map(([status,value])=><tr key={status}><td>{status}</td><td>{count(value)}</td></tr>)}</tbody></table></div><p>First occurrence {selected.analytics.volume.firstOccurrence} · Last occurrence {selected.analytics.volume.lastOccurrence}. Missing financial amounts remain not applicable.</p></>}
      {tab==='Next steps'&&<><h3>Review the evidence</h3><p>Confirm the source records, check the contributing organisations, and compare the selected scope before deciding what to investigate. The signal explains a concentration; it does not establish causation.</p><div className={styles.row}><Link className={styles.button} href="/workspace/datasets">Inspect source records<ArrowUpRight size={12}/></Link><Link className={styles.button} href="/workspace/timeline">Explore event history<ArrowUpRight size={12}/></Link></div><SelectionAnalysis key={`${key}:${selected.scenarioId}`} filters={filters} eventIds={selectionFor(selected).eventIds} configured={configured}/><DemoAction key={`${key}:${selected.scenarioId}:action`} signal={selected}/></>}
      </div><p className={styles.footnote}>Synthetic operational data · Computed by the existing backend · Current applied scope: {filters.organisation}, {filters.eventType}, {filters.severity}.</p></>}</section></div>}
  </main>;
}
