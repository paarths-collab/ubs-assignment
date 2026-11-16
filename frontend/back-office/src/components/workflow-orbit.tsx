"use client";

import { useId, useMemo, useState, type PointerEvent } from "react";
import { ArrowRight, Braces, CalendarDays, Check, Database, FileCheck, FileSpreadsheet, Layers3, MapPin, Pause, Play, Table2, Users } from "lucide-react";
import type { SampleRow } from "@/lib/sample-data";
import styles from "./workflow-orbit.module.css";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const dateLabel = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const stages = [{ label: "Source", icon: FileSpreadsheet }, { label: "Analysis", icon: Braces }, { label: "Evidence", icon: FileCheck }];

export function WorkflowOrbit({ rows }: { rows: readonly SampleRow[] }) {
  const id = useId();
  const [stage, setStage] = useState(1);
  const [context, setContext] = useState(0);
  const [cursor, setCursor] = useState(12);
  const [paused, setPaused] = useState(false);
  const data = useMemo(() => {
    const customerIds = [...new Set(rows.map(row => row.customer))].sort();
    const regions = [...new Set(rows.map(row => row.region))].sort();
    const months = [...new Set(rows.map(row => row.date.slice(0, 7)))].sort();
    const monthly = months.map(month => { const selected = rows.filter(row => row.date.startsWith(month)); return { month, value: selected.reduce((sum, row) => sum + row.revenue, 0), count: selected.length }; });
    const daily = new Map<string, number>();
    for (const row of rows) { const day = row.date.slice(0, 10); daily.set(day, (daily.get(day) ?? 0) + row.revenue); }
    const ordered = [...daily].sort(([a], [b]) => a.localeCompare(b));
    const cumulative = ordered.map(([date], index) => ({ date, value: ordered.slice(0, index + 1).reduce((sum, [, value]) => sum + value, 0) }));
    const total = rows.reduce((sum, row) => sum + row.revenue, 0);
    return { customerIds, regions, months, monthly, cumulative, total, groups: customerIds.slice(0, 6).map(customer => ({ customer, count: rows.filter(row => row.customer === customer).length })) };
  }, [rows]);
  const points = useMemo(() => {
    const first = Date.parse(data.cumulative[0]?.date ?? "2000-01-01");
    const last = Date.parse(data.cumulative[data.cumulative.length - 1]?.date ?? "2000-01-01");
    const minimum = Math.min(0, ...data.cumulative.map(point => point.value));
    const maximum = Math.max(1, ...data.cumulative.map(point => point.value));
    return data.cumulative.map(point => ({ ...point, x: 24 + (Date.parse(point.date) - first) / Math.max(1, last - first) * 352, y: 176 - (point.value - minimum) / (maximum - minimum) * 140 }));
  }, [data.cumulative]);
  const activeIndex = Math.min(cursor, Math.max(0, points.length - 1));
  const activePoint = points[activeIndex];
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const monthlyMaximum = Math.max(1, ...data.monthly.map(month => Math.abs(month.value)));
  const plotMinimum = Math.min(0, ...data.cumulative.map(point => point.value));
  const plotMaximum = Math.max(1, ...data.cumulative.map(point => point.value));
  const areaBaseline = 176 - (0 - plotMinimum) / (plotMaximum - plotMinimum) * 140;
  const contexts = [
    { name: "Records", icon: Table2, value: rows.length, title: "Every observed record.", text: `${rows.length} sales records supply the dates, customer IDs, regions, and revenue used in these views.`, detail: "Count of source rows" },
    { name: "Customers", icon: Users, value: data.customerIds.length, title: "Distinct customers, counted once.", text: `${data.customerIds.length} unique customer IDs appear in the supplied source. Repeated transactions retain the same customer identity.`, detail: "Distinct customer_id values" },
    { name: "Regions", icon: MapPin, value: data.regions.length, title: "The regional context.", text: data.regions.length ? `The source includes ${data.regions.join(", ")}. Each revenue total is grouped using its recorded region.` : "No regions are present in this source.", detail: "Distinct region values" },
    { name: "Months", icon: CalendarDays, value: data.months.length, title: "The months actually recorded.", text: data.months.length ? `${data.months.map(monthLabel).join(", ")} appear in the source. Monthly summaries add the revenue recorded in each calendar month.` : "No recorded dates are available.", detail: "Observed calendar months" },
  ];
  const stageDetails = [
    { title: "Start with the records you can inspect.", text: `${rows.length} source records and ${data.customerIds.length} distinct customers form the starting point. The same dates, regions, and revenue fields stay connected through every view.`, tag: "Original source rows" },
    { title: "A clear path from rows to results.", text: `Group the source into ${data.months.length} observed months or ${data.regions.length} regions. Revenue is summed directly from the supplied records, with ${money(data.total)} recorded in total.`, tag: "Local, deterministic calculations" },
    { title: "Keep the source behind the summary.", text: "Each miniature report shows an observed month, its record count, and its calculated revenue. Inspect the source context or scrub the recorded trend below to follow the numbers.", tag: "Traceable source summaries" },
  ];
  function scrub(event: PointerEvent<SVGSVGElement>) {
    if (!points.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(1, bounds.width) * 400;
    const closest = points.reduce((best, point, index) => Math.abs(point.x - x) < Math.abs(points[best].x - x) ? index : best, 0);
    setCursor(closest);
  }
  const flowTitle = `${rows.length} source records across ${data.customerIds.length} customers feed local calculations and ${data.months.length} observed monthly summaries. ${data.monthly.slice(0, 3).map(month => `${monthLabel(month.month)}: ${money(month.value)} from ${month.count} transactions`).join("; ")}`;
  return <section id="live-workflow" className={styles.orbit} data-paused={paused ? "true" : "false"} aria-labelledby={`${id}-heading`}>
    <div className={styles.heading} data-reveal><div><span className={styles.eyebrow}><Layers3 size={13} />CONNECTED WORKFLOW</span><h2 id={`${id}-heading`}>One source.<br />A connected perspective.</h2><p>Follow your data from its first record to a result you can inspect.</p></div><button className={styles.pauseButton} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={12} /> : <Pause size={12} />}{paused ? "Resume diagrams" : "Pause diagrams"}</button></div>
    <div className={styles.grid}>
      <article className={`${styles.card} ${styles.flowCard}`} data-reveal data-stage={stage}>
        <span className={styles.bracketTop} aria-hidden="true" /><span className={styles.bracketBottom} aria-hidden="true" />
        <div className={styles.diagramMeta}><span><i />SOURCE / COMPUTE / EVIDENCE</span><span>Browser calculations · USD</span></div>
        <div className={styles.flowGraphic}><svg viewBox="0 0 1000 290" role="img" aria-label={flowTitle}><title>{flowTitle}</title>
          <text x="115" y="22" className={styles.svgEyebrow}>CUSTOMER RECORDS</text><text x="728" y="22" className={styles.svgEyebrow}>OBSERVED SUMMARIES</text>
          {data.groups.map((group, index) => {
            const y = data.groups.length === 1 ? 145 : 48 + index * 190 / Math.max(1, data.groups.length - 1);
            const path = `M244 ${y}H${285 + index * 6}C${345 + index * 5} ${y} 350 145 432 145`;
            return <g key={group.customer}><path d={path} className={styles.connection} /><path d={path} pathLength="100" className={styles.particle} style={{ animationDelay: `${index * -.65}s` }} /><rect x="115" y={y - 15} width="129" height="30" rx="6" fill="white" className={styles.sourceNode} /><rect x="124" y={y - 8} width="17" height="17" rx="4" className={styles.sourceMark} /><text x="132.5" y={y + 3.7} textAnchor="middle" className={styles.sourceInitial}>{index + 1}</text><text x="150" y={y + 4} className={styles.sourceLabel}>{group.customer.length > 12 ? `${group.customer.slice(0, 11)}…` : group.customer}</text><text x="233" y={y + 4} textAnchor="end" className={styles.sourceCount}>{group.count}</text></g>;
          })}
          {[0, 1, 2].slice(0, data.monthly.length).map(index => { const y = 75 + index * 70; const path = `M568 145C638 145 642 ${y} 728 ${y}`; return <g key={index}><path d={path} className={styles.connection} /><path d={path} pathLength="100" className={`${styles.particle} ${styles.outputParticle}`} style={{ animationDelay: `${index * -1.1}s` }} /></g>; })}
          <rect x="432" y="112" width="136" height="66" rx="9" className={styles.analysisHub} /><Braces x="445" y="130" width="26" height="26" className={styles.hubIcon} /><text x="481" y="140" className={styles.hubTitle}>Analysis</text><text x="481" y="156" className={styles.hubSubtitle}>Local computation</text>
          {data.monthly.slice(0, 3).map((month, index) => <g key={month.month}><rect x="728" y={48 + index * 70} width="167" height="54" rx="6" className={styles.reportNode} /><text x="741" y={65 + index * 70} className={styles.reportTitle}>{monthLabel(month.month)}</text><text x="882" y={65 + index * 70} textAnchor="end" className={styles.reportValue}>{money(month.value)}</text><rect x="741" y={76 + index * 70} width="104" height="4" rx="2" className={styles.reportTrack} /><rect x="741" y={76 + index * 70} width={Math.abs(month.value) / monthlyMaximum * 104} height="4" rx="2" className={styles.reportBar} /><text x="741" y={92 + index * 70} className={styles.reportCount}>{`${month.count} recorded transactions`}</text></g>)}
          <text x="115" y="274" className={styles.diagramCaption}>{`${data.groups.length} of ${data.customerIds.length} customer groups shown`}</text><text x="895" y="274" textAnchor="end" className={styles.diagramCaption}>{`${Math.min(3, data.months.length)} of ${data.months.length} months shown`}</text>
        </svg></div>
        <div className={styles.mobileFlow}>{[{ icon: FileSpreadsheet, name: "Source", metric: `${rows.length} records` }, { icon: Braces, name: "Analysis", metric: `${data.regions.length} regions` }, { icon: FileCheck, name: "Evidence", metric: `${data.months.length} months` }].map((item, index) => <div key={item.name} data-active={stage === index}><item.icon size={18} /><strong>{item.name}</strong><span>{item.metric}</span>{index < 2 && <ArrowRight className={styles.mobileArrow} size={14} />}</div>)}</div>
        <div className={styles.stageControls} aria-label="Explore the workflow stages">{stages.map((item, index) => <button key={item.label} onClick={() => setStage(index)} aria-pressed={stage === index}><span>0{index + 1}</span><item.icon size={13} />{item.label}</button>)}</div>
        <div className={styles.flowCopy}><div key={stage} className={styles.focusedCopy}><span className={styles.copyEyebrow}>{stageDetails[stage].tag}</span><h3>{stageDetails[stage].title}</h3><p>{stageDetails[stage].text}</p></div><div className={styles.evidenceCopy}><span className={styles.copyEyebrow}>SAME DATA, THROUGHOUT</span><h3>Every view stays connected.</h3><p>Change the focus, inspect a different context, and keep the original source in view.</p><div><span><Check size={12} />{rows.length} records</span><span><Check size={12} />{data.customerIds.length} customers</span><span><Check size={12} />{money(data.total)} observed</span></div></div></div>
      </article>
      <article className={`${styles.card} ${styles.contextCard}`} data-reveal>
        <span className={styles.bracketTop} aria-hidden="true" /><span className={styles.bracketBottom} aria-hidden="true" />
        <div className={styles.smallMeta}><span>01 / SOURCE CONTEXT</span><span>SELECT A VIEW</span></div>
        <div className={styles.contextDiagram}><svg viewBox="0 0 400 260" preserveAspectRatio="none" aria-hidden="true"><path d="M80 65H125Q142 65 142 82V112Q142 130 160 130H200M320 65H275Q258 65 258 82V112Q258 130 240 130H200M80 207H125Q142 207 142 190V149Q142 130 160 130H200M320 207H275Q258 207 258 190V149Q258 130 240 130H200" className={styles.contextConnection} />{["M80 65H125Q142 65 142 82V112Q142 130 160 130H200", "M320 65H275Q258 65 258 82V112Q258 130 240 130H200", "M80 207H125Q142 207 142 190V149Q142 130 160 130H200", "M320 207H275Q258 207 258 190V149Q258 130 240 130H200"].map((path, index) => <path key={index} d={path} pathLength="100" className={`${styles.contextPulse} ${context === index ? styles.contextPulseActive : ""}`} />)}</svg><div className={styles.contextHub}><Database size={24} /><span>Source</span></div>{contexts.map((item, index) => <button key={item.name} className={`${styles.contextNode} ${styles[`node${index}`]}`} aria-pressed={context === index} aria-label={`${item.name}: ${item.value}. Inspect this source context.`} onClick={() => setContext(index)}><span><item.icon size={18} /></span><strong>{item.name}</strong><small>{item.value}</small></button>)}</div>
        <div className={styles.contextCopy} key={context}><span className={styles.copyEyebrow}>{contexts[context].detail}</span><h3>{contexts[context].title}</h3><p>{contexts[context].text}</p></div>
      </article>
      <article className={`${styles.card} ${styles.trendCard}`} data-reveal>
        <span className={styles.bracketTop} aria-hidden="true" /><span className={styles.bracketBottom} aria-hidden="true" />
        <div className={styles.smallMeta}><span>02 / OBSERVED TREND</span><span>DRAG TO INSPECT</span></div>
        <div className={styles.trendReadout}><div><span>Cumulative revenue</span><strong>{activePoint ? money(activePoint.value) : "—"}</strong></div><span>{activePoint ? dateLabel(activePoint.date) : "No recorded dates"}</span></div>
        {activePoint ? <div className={styles.trendPlot}><svg viewBox="0 0 400 215" preserveAspectRatio="none" role="img" aria-label={`Observed cumulative revenue. Selected ${dateLabel(activePoint.date)}: ${money(activePoint.value)}. Use the range control below to inspect each date.`} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); scrub(event); }} onPointerMove={event => { if (event.buttons === 1) scrub(event); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}><title>{`Observed cumulative revenue from ${dateLabel(points[0].date)} to ${dateLabel(points[points.length - 1].date)}. Selected value ${money(activePoint.value)}.`}</title><defs><linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--orbit-accent)" stopOpacity=".18" /><stop offset="1" stopColor="var(--orbit-accent)" stopOpacity="0" /></linearGradient><clipPath id={`${id}-selected`}><rect x="0" y="0" width={activePoint.x} height="190" /></clipPath></defs>{[36, 82, 129, 176].map(y => <line key={y} x1="24" x2="376" y1={y} y2={y} stroke="#ededed" strokeDasharray="3 5" />)}<path d={`${line}L${points[points.length - 1].x},${areaBaseline}L24,${areaBaseline}Z`} fill="#f8f8f8" /><path d={line} fill="none" stroke="#c7c9cc" strokeWidth="1.7" strokeLinejoin="round" /><g clipPath={`url(#${id}-selected)`}><path d={`${line}L${points[points.length - 1].x},${areaBaseline}L24,${areaBaseline}Z`} fill={`url(#${id}-fill)`} /><path d={line} fill="none" stroke="var(--orbit-accent)" strokeWidth="2" strokeLinejoin="round" /></g><line x1={activePoint.x} x2={activePoint.x} y1="21" y2="176" className={styles.focusDivider} /><circle cx={activePoint.x} cy={activePoint.y} r="8" className={styles.focusHalo} /><circle cx={activePoint.x} cy={activePoint.y} r="4" className={styles.focusDot} /><text x="24" y="205" className={styles.chartDate}>{new Date(`${points[0].date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</text><text x="376" y="205" textAnchor="end" className={styles.chartDate}>{new Date(`${points[points.length - 1].date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</text></svg></div> : <div className={styles.noData}>No source records are available for this view.</div>}
        <label className={styles.scrubberLabel} htmlFor={`${id}-date-range`}><span>Inspect recorded dates</span><span>{activePoint ? `${activeIndex + 1} / ${points.length}` : "0 / 0"}</span></label><input id={`${id}-date-range`} className={styles.scrubber} type="range" min="0" max={Math.max(0, points.length - 1)} value={activeIndex} disabled={points.length <= 1} onChange={event => setCursor(Number(event.target.value))} aria-valuetext={activePoint ? `${dateLabel(activePoint.date)}, cumulative revenue ${money(activePoint.value)}` : "No records"} />
        <div className={styles.trendCopy}><span className={styles.copyEyebrow}>ACTUAL RECORDS / CALENDAR DATE AXIS</span><h3>Find the shape of what happened.</h3><p>Move the focus to inspect the running revenue total. Every point comes from the dates and values in the supplied source.</p></div>
      </article>
    </div>
    <p className={styles.sectionNote}><Check size={12} />Calculated from the supplied sales rows. Diagrams illustrate the local workflow; chart values are observed source data.</p>
  </section>;
}
