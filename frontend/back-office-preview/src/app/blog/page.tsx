import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, ChartNoAxesCombined, Database, ScanSearch } from "lucide-react";
import { guides } from "./docs-content";
import styles from "./blog.module.css";

export const metadata: Metadata = {
  title: "Guides · DataLens",
  description: "Documentation for importing data, asking questions, checking results, and saving reports.",
};

const steps = [
  { icon: Database, number: "01", title: "Bring a source", text: "Upload CSV or Excel, then inspect its fields, profile, and preview.", href: "/blog/uploading-data" },
  { icon: ChartNoAxesCombined, number: "02", title: "Ask with context", text: "Select your files, name the measure, and follow the result through a chart.", href: "/blog/asking-questions" },
  { icon: ScanSearch, number: "03", title: "Check the evidence", text: "Read the method, SQL, and source versions before saving or sharing.", href: "/blog/verifying-results" },
];

export default function GuidesHome() {
  return <main id="main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span aria-current="page">Guides</span></nav>
    <div className={styles.eyebrow}><BookOpen size={14} />BACK OFFICE DOCUMENTATION</div>
    <h1 className={styles.homeTitle}>Build a clearer answer.</h1>
    <p className={styles.lede}>Learn the path from a source file to a result you can inspect. Start with the workflow or jump straight to a guide.</p>
    <div className={styles.introActions}><Link className={styles.primary} href="/blog/getting-started">Get started <ArrowRight size={15} /></Link><Link className={styles.textLink} href="/#product">Open data sources <ArrowRight size={14} /></Link></div>
    <section className={styles.stepsSection} aria-labelledby="workflow-heading"><div className={styles.sectionHeading}><div><span>THE WORKFLOW</span><h2 id="workflow-heading">From question to evidence.</h2></div><p>Three steps to a trustworthy result</p></div><div className={styles.steps}>{steps.map(step => <Link className={styles.stepCard} href={step.href} key={step.number}><span className={styles.stepTop}><step.icon size={23} strokeWidth={1.6} /><small>{step.number}</small></span><strong>{step.title}</strong><span>{step.text}</span><ArrowRight className={styles.stepArrow} size={17} /></Link>)}</div></section>
    <section className={styles.allGuides} aria-labelledby="all-guides-heading"><div className={styles.sectionHeading}><div><span>REFERENCE</span><h2 id="all-guides-heading">All guides</h2></div><p>{guides.length} concise articles</p></div><div className={styles.guideList}>{guides.map((guide, index) => <Link href={`/blog/${guide.slug}`} className={styles.guideRow} key={guide.slug}><span className={styles.guideNumber}>{String(index + 1).padStart(2, "0")}</span><span className={styles.guideText}><strong>{guide.title}</strong><small>{guide.description}</small></span><span className={styles.guideMeta}>{guide.category} · {guide.readingTime}</span><ArrowRight size={16} /></Link>)}</div></section>
  </main>;
}
