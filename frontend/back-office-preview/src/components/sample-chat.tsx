"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Check, Copy, FileSpreadsheet, Paperclip, Plus, RotateCcw } from "lucide-react";
import { parseSalesSource, type SampleSource } from "@/lib/sample-data";
import { answerSample, type SampleAnswer } from "@/lib/sample-answers";
import styles from "./sample-chat.module.css";

type Reply = SampleAnswer & { id: number; question: string };
const questions = ["Revenue by region", "Monthly revenue", "How many customers?"];

export function SampleChat({ rows, columnCount, completeness }: SampleSource) {
  const initial = { rows, columnCount, completeness };
  const [source, setSource] = useState<SampleSource>(initial);
  const [name, setName] = useState("analysis_flat.csv");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Reply[]>([]);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null), file = useRef<HTMLInputElement>(null), log = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  useEffect(() => {
    function ask(event: Event) {
      const value = (event as CustomEvent<{ question?: unknown }>).detail?.question;
      if (typeof value !== "string") return;
      setQuestion(value.slice(0, 1000)); input.current?.focus({ preventScroll: true });
    }
    window.addEventListener("home-ask", ask);
    return () => window.removeEventListener("home-ask", ask);
  }, []);
  useEffect(() => { if (log.current) log.current.scrollTop = messages.length ? log.current.scrollHeight : 0; }, [messages]);
  function send(event?: FormEvent) {
    event?.preventDefault();
    const text = question.trim(); if (!text || reading) return;
    const reply = answerSample(text, source, messages.at(-1)?.question);
    setMessages(previous => [...previous.slice(-19), { ...reply, question: text, id: ++sequence.current }]);
    setQuestion(""); setNotice(""); input.current?.focus();
  }
  async function attach(files: FileList | null) {
    const selected = files?.[0]; if (!selected) return;
    setReading(true); setNotice("");
    try {
      if (selected.size > 1024 * 1024) throw new Error("Use a CSV under 1 MiB for this interactive preview.");
      if (!selected.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a CSV file.");
      const loaded = parseSalesSource(await selected.text()); setSource(loaded); setName(selected.name.slice(0, 120)); setMessages([]);
      setNotice(`${loaded.rows.length} records loaded locally. Your file was not uploaded.`);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "The CSV could not be read."); }
    finally { setReading(false); if (file.current) file.current.value = ""; }
  }
  const workspace = `/#chat`;
  return <div className={styles.chat}>
    <header><span><i />Conversation preview</span><div><button type="button" aria-label="Start a new conversation" title="New conversation" onClick={() => { setMessages([]); setQuestion(""); setNotice(""); input.current?.focus(); }}><Plus size={14}/></button><Link href={workspace} aria-label="Explore chat preview" title="Chat preview"><ArrowUpRight size={15}/></Link></div></header>
    <div ref={log} className={styles.messages} role="log" aria-label="Conversation preview" aria-live="polite">
      {!messages.length ? <div className={styles.welcome}><strong>What would you like to understand?</strong><p>Ask about the included sales data. Answers use its actual values.</p><div>{questions.map(value => <button key={value} type="button" onClick={() => { setQuestion(value); input.current?.focus(); }}>{value}</button>)}</div></div> : messages.map(item => <article key={item.id}><p className={styles.question}>{item.question}</p><div className={styles.reply}><p>{item.answer}</p>{item.values && <table><caption className="visually-hidden">Computed values</caption><tbody>{item.values.map(value => <tr key={value.label}><th scope="row">{value.label}</th><td>{value.value}</td></tr>)}</tbody></table>}<details><summary>Calculation</summary><p>{item.method}</p></details><button type="button" className={styles.copy} aria-label="Copy answer" onClick={async () => { try { await navigator.clipboard.writeText([item.answer, ...(item.values?.map(value => `${value.label}: ${value.value}`) ?? []), item.method].join("\n")); setCopied(item.id); } catch { setNotice("Clipboard access was unavailable. Select the answer to copy it."); } }}>{copied === item.id ? <Check size={12}/> : <Copy size={12}/>} {copied === item.id ? "Copied" : "Copy"}</button></div></article>)}
    </div>
    <form onSubmit={send} className={styles.composer}><label className="visually-hidden" htmlFor="home-sample-question">Question about the data</label><textarea id="home-sample-question" ref={input} rows={2} maxLength={1000} value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask a question about your data…" disabled={reading} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/><div><button type="button" aria-label="Attach a local sales CSV" title="Attach a sales CSV (sale_date, revenue_usd, region, customer_id)" onClick={() => file.current?.click()} disabled={reading}><Paperclip size={15}/></button><span title={name}><FileSpreadsheet size={12}/>{name}</span>{name !== "analysis_flat.csv" && <button type="button" aria-label="Restore the included data" title="Restore data" onClick={() => { setSource(initial); setName("analysis_flat.csv"); setMessages([]); setNotice("Included data restored."); }}><RotateCcw size={13}/></button>}<button type="submit" aria-label="Send question" disabled={!question.trim() || reading}><ArrowUp size={16}/></button></div></form>
    <input ref={file} type="file" accept=".csv,text/csv" className={styles.file} aria-label="Choose a local sales CSV" onChange={event => void attach(event.target.files)}/>
    <p className={styles.note} role="status">{reading ? "Reading your local CSV…" : notice || "Interactive preview · Calculated locally · Enter to send"}</p>
  </div>;
}
