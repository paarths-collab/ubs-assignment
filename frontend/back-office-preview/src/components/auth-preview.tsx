"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChartNoAxesCombined, Check, Database, ShieldCheck } from "lucide-react";
import styles from "./auth-preview.module.css";

const months = [
  { label: "Jan", revenue: 360, records: 8 },
  { label: "Feb", revenue: 1000, records: 8 },
  { label: "Mar", revenue: 2400, records: 8 },
] as const;

export function AuthPreview() {
  const [measure, setMeasure] = useState<"revenue" | "records">("revenue");
  const [selected, setSelected] = useState(2);
  const current = months[selected];
  return <div className={styles.preview} aria-label="Interactive preview of included synthetic sales data">
    <div className={styles.topline}><span className={styles.liveDot} /> INCLUDED DATA <span className={styles.sourceName}>analysis_flat.csv</span></div>
    <div className={styles.intro}><div><h2>From source to insight.</h2><p>Real calculations from the included synthetic data.</p></div><ChartNoAxesCombined size={21} strokeWidth={1.5} /></div>
    <div className={styles.stats} aria-label="Recorded totals"><div><span>RECORDED REVENUE</span><strong>$3,760</strong></div><div><span>TRANSACTIONS</span><strong>24</strong></div><div><span>CUSTOMERS</span><strong>6</strong></div></div>
    <div className={styles.analysis}>
      <div className={styles.chartPanel}>
        <div className={styles.chartHeading}><div><span>MONTHLY VIEW</span><strong>{measure === "revenue" ? "Revenue by month" : "Transactions by month"}</strong></div><div className={styles.measureTabs} role="group" aria-label="Chart measure"><button type="button" aria-pressed={measure === "revenue"} onClick={() => setMeasure("revenue")}>Revenue</button><button type="button" aria-pressed={measure === "records"} onClick={() => setMeasure("records")}>Records</button></div></div>
        <div className={styles.chart} aria-label={measure === "revenue" ? "Monthly revenue: January $360, February $1,000, March $2,400" : "Eight records in each of January, February, and March"}>
          <div className={styles.gridlines} aria-hidden="true"><i /><i /><i /></div>
          {months.map((month, index) => {
            const value = measure === "revenue" ? month.revenue : month.records;
            const height = measure === "revenue" ? Math.max(17, value / 2400 * 100) : 60;
            const shortValue = value < 1000 ? `$${value}` : `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
            return <button type="button" key={month.label} className={styles.barGroup} aria-pressed={selected === index} aria-label={`${month.label}: ${measure === "revenue" ? "$" + value.toLocaleString() + " revenue" : value + " transactions"}`} onClick={() => setSelected(index)}><span className={styles.barValue}>{measure === "revenue" ? shortValue : value}</span><span className={styles.barTrack}><span className={styles.bar} style={{ height: `${height}%`, animationDelay: `${index * 130}ms` }} /></span><span className={styles.barLabel}>{month.label}</span></button>;
          })}
        </div>
      </div>
      <div className={styles.evidence}><div className={styles.evidenceTitle}><ShieldCheck size={16} /><span>TRACEABLE RESULT</span></div><strong>{measure === "revenue" ? `$${current.revenue.toLocaleString()}` : current.records}</strong><span className={styles.evidencePeriod}>{current.label} 2026 · {measure === "revenue" ? "recorded revenue" : "source records"}</span><div className={styles.evidenceRule} /><span className={styles.evidenceLabel}>CALCULATION</span><p>{measure === "revenue" ? "SUM(revenue_usd)" : "COUNT(source rows)"}<br />grouped by calendar month</p><div className={styles.verified}><Check size={12} />Computed from source rows</div></div>
    </div>
    <div className={styles.footer}><div className={styles.flow}><span><Database size={13} />Source</span><i /><span><ChartNoAxesCombined size={13} />Compute</span><i /><span><ShieldCheck size={13} />Evidence</span></div><Link href="/#preview">Explore preview <ArrowUpRight size={13} /></Link></div>
  </div>;
}
