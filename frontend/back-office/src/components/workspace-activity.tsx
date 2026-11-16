"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CheckCheck, Database, History, LayoutDashboard, MessageSquare, RefreshCw, Upload } from "lucide-react";
import { api } from "@/lib/api";
import styles from "./workspace-activity.module.css";

type Conversation = { id: string; title: string; updated_at: string; selected_dataset_versions: { display_name: string }[] };
type Dashboard = { id: string; title: string; created_at: string; status: string; complete_cards: number; total_cards: number };

export function recordedDate(value: string) {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "Saved work" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WorkspaceActivity() {
  const [state, setState] = useState<{ loading: boolean; conversations: Conversation[] | null; dashboards: Dashboard[] | null }>({ loading: true, conversations: null, dashboards: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api<Conversation[]>("/conversations", { signal: controller.signal }),
      api<Dashboard[]>("/dashboards", { signal: controller.signal }),
    ]).then(([conversations, dashboards]) => {
      if (controller.signal.aborted) return;
      setState({ loading: false, conversations: conversations.status === "fulfilled" ? conversations.value : null, dashboards: dashboards.status === "fulfilled" ? dashboards.value : null });
    });
    return () => controller.abort();
  }, [attempt]);
  function retry() { setState(previous => ({ ...previous, loading: true })); setAttempt(value => value + 1); }
  return <div className={styles.activityGrid}>
    <section className={styles.panel} aria-labelledby="recent-work-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>PICK UP WHERE YOU LEFT OFF</span><h2 id="recent-work-title"><History size={15} />Recent conversations</h2></div><Link href="/analyze">View all<ArrowUpRight size={13} /></Link></div>
      {state.loading ? <p className={styles.state} role="status">Loading recent work…</p> : state.conversations === null ? <div className={styles.state}><p>Recent conversations could not be loaded.</p><button onClick={retry}><RefreshCw size={12} />Try again</button></div> : state.conversations.length ? <div className={styles.workList}>{state.conversations.slice(0, 4).map(item => <Link href={`/analyze?conversation=${encodeURIComponent(item.id)}`} key={item.id}><span className={styles.workIcon}><MessageSquare size={15} /></span><span className={styles.workCopy}><strong>{item.title}</strong><small>{item.selected_dataset_versions.map(source => source.display_name).join(" · ") || "Source selection"}</small></span><time>{recordedDate(item.updated_at)}</time><ArrowUpRight size={13} /></Link>)}</div> : <div className={styles.startState}><MessageSquare size={23} /><h3>Your next question starts here.</h3><p>Ask about a trend, compare a category, or investigate an unusual value. Conversations are saved as you work.</p><Link href="/analyze">Start an analysis<ArrowRight size={13} /></Link></div>}
    </section>
    <section className={styles.panel} aria-labelledby="recent-dashboards-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>KEEP THE USEFUL RESULTS</span><h2 id="recent-dashboards-title"><LayoutDashboard size={15} />Saved dashboards</h2></div><Link href="/dashboards">Open library<ArrowUpRight size={13} /></Link></div>
      {state.loading ? <p className={styles.state} role="status">Loading saved dashboards…</p> : state.dashboards === null ? <div className={styles.state}><p>Saved dashboards could not be loaded.</p><button onClick={retry}><RefreshCw size={12} />Try again</button></div> : state.dashboards.length ? <div className={styles.workList}>{state.dashboards.slice(0, 4).map(item => <Link href={`/dashboards/${encodeURIComponent(item.id)}`} key={item.id}><span className={styles.workIcon}><LayoutDashboard size={15} /></span><span className={styles.workCopy}><strong>{item.title}</strong><small>{item.complete_cards} of {item.total_cards} cards computed · {item.status === "complete" ? "Complete" : "Needs review"}</small></span><time>{recordedDate(item.created_at)}</time><ArrowUpRight size={13} /></Link>)}</div> : <div className={styles.startState}><LayoutDashboard size={23} /><h3>A home for your findings.</h3><p>Save up to six computed cards in a dashboard, revisit the evidence, and export the results as an HTML report.</p><Link href="/dashboards">Create a dashboard<ArrowRight size={13} /></Link></div>}
    </section>
  </div>;
}

export function WorkspaceJourney() {
  return <section className={styles.journey} aria-labelledby="workspace-journey-title"><div className={styles.journeyHeading}><div><span className={styles.eyebrow}>YOUR ANALYSIS WORKFLOW</span><h2 id="workspace-journey-title">From your first file to your next decision.</h2></div><span><CheckCheck size={13} />Source references included</span></div><div className={styles.journeyGrid}>{[
    { icon: Upload, title: "Bring your data", text: "Upload CSV or Excel files, inspect the fields, and review missing values before you begin.", href: "/datasets", action: "Manage sources" },
    { icon: MessageSquare, title: "Explore a question", text: "Compare metrics, follow a trend, or check for outliers. Review the table, chart, and SQL behind the answer.", href: "/analyze", action: "Ask your data" },
    { icon: LayoutDashboard, title: "Keep the evidence", text: "Collect useful results into a saved dashboard and download a report that opens offline.", href: "/dashboards", action: "Open dashboards" },
  ].map((item, index) => <Link href={item.href} key={item.href}><div><span className={styles.journeyIcon}><item.icon size={18} /></span><span className={styles.step}>0{index + 1}</span></div><h3>{item.title}</h3><p>{item.text}</p><span className={styles.journeyAction}>{item.action}<ArrowRight size={13} /></span></Link>)}</div><p className={styles.providerNote}><Database size={12} />Uploads and profiles work without a model key. New AI answers and generated dashboards need a configured provider.</p></section>;
}
