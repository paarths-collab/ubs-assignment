"use client";
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Square } from 'lucide-react';
import { consumeAnalysis } from '../analyze/stream';
import type { Filters } from '../overview/data';
import styles from './investigate.module.css';
type Answer = { title: string; complete: boolean; sections: { id: string; title: string; text: string }[] };
export function SelectionAnalysis({ filters, eventIds, configured }: { filters: Filters; eventIds: string[]; configured: boolean }) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  function stop() { active.current?.abort(); active.current = null; setAnswer(null); setBusy(false); }
  async function start(endpoint: string) {
    if (!configured || busy || !eventIds.length) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setAnswer(null);
    try {
      const response = await fetch(`/api/operational/ai/${endpoint}/stream`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({filters,selection:{type:'eventIds',eventIds}}),signal:controller.signal });
      await consumeAnalysis(response, event => {
        if (active.current !== controller || controller.signal.aborted) return;
        if (event.type === 'analysis_start') setAnswer({title:event.title,sections:[],complete:false});
        if (event.type === 'section_start') setAnswer(value=>value ? {...value,sections:[...value.sections,{id:event.sectionId,title:event.title,text:''}]}:value);
        if (event.type === 'section_delta') setAnswer(value=>value ? {...value,sections:value.sections.map(section=>section.id===event.sectionId?{...section,text:section.text+event.delta}:section)}:value);
        if (event.type === 'analysis_complete') setAnswer(value=>value ? {...value,complete:true}:value);
        if (event.type === 'analysis_error') {setAnswer(null);setError(event.message);}
      },controller.signal);
    } catch (err) { if (!controller.signal.aborted && active.current===controller) {setAnswer(null);setError(err instanceof Error?err.message:'Analysis unavailable.');} }
    finally {if(active.current===controller){active.current=null;setBusy(false);}}
  }
  return <section className={styles.analysis} aria-label="AI investigation"><h3><Sparkles size={15}/> Explore this evidence with AI</h3><p>{configured?'Interpretations use this selection’s verified evidence. Review them against the source.':'No AI provider is configured. All computed evidence above is still available.'}</p><div className={styles.row}>{[['deep-analysis','Deep analysis'],['investigation-plan','Investigation plan'],['enterprise-comparison','Compare with enterprise']].map(([endpoint,label])=><button key={endpoint} disabled={!configured||busy||!eventIds.length} onClick={()=>void start(endpoint)}>{label}</button>)}{busy&&<button onClick={stop}><Square size={13}/>Stop analysis</button>}</div>{error&&<p role="alert">{error}</p>}{answer&&<div aria-live={busy?'off':'polite'}><p>{answer.complete?'AI interpretation · server validated':'Generating interpretation…'}</p><h3>{answer.title}</h3>{answer.sections.map(section=><section key={section.id}><h3>{section.title}</h3><p>{section.text}</p></section>)}</div>}</section>;
}
