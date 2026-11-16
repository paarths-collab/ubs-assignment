import { readFile } from "node:fs/promises";
import path from "node:path";
import { LiveDashboard } from "@/components/live-dashboard";
import { SourcePreview, MobilePreview, BrowserPreview } from "@/components/live-feature-previews";
import { SampleChat } from "@/components/sample-chat";
import { HomeActions } from "@/components/home-actions";
import { HomeMotion } from "@/components/home-motion";
import { PublicHeader } from "@/components/public-header";
import { WorkflowOrbit } from "@/components/workflow-orbit";
import { parseSalesSource } from "@/lib/sample-data";
import Link from "next/link";
import { TemplateSections } from "@/components/template-sections";
import { ArrowRight, ArrowUpRight, BarChart3, ChevronDown, Database, Braces, FileSpreadsheet, Globe, PanelsTopLeft, ShieldCheck } from "lucide-react";
import styles from "./home.module.css";

const questions = [
  ["Which files can I use?", "Upload CSV, XLS, or XLSX files. Inspect columns, missing values, and a row preview before starting an analysis."],
  ["How does the AI analysis work?", "Choose your sources and ask a question. Your configured AI provider proposes a plan; the application validates the SQL and computes the result against your authorized data."],
  ["Can I verify an answer?", "Completed analyses include executed SQL, a method summary, source versions, charts, and computed tables. Saved dashboards retain that evidence."],
  ["Do I need an API key?", "A Gemini, OpenRouter, or Groq key is required for new AI questions and generated dashboards. The public preview works without one. New questions in the full application require a configured provider."],
  ["What can I export?", "Export completed analyses and dashboards as a self-contained HTML report with charts, tables, calculations, and source references."],
  ["Where does my data go?", "This preview uses included synthetic data in your browser. The full application stores uploaded files in its private backend and sends bounded metadata to a configured AI provider."],
  ["Can I interact with the home page?", "Yes. Charts, filters, tables, the interactive conversation, mobile view, downloads, and local settings work in your browser. The included source is synthetic. Explore the dashboard to use your own files and configured AI provider."],
];
const workflowTools = [
  { label: "CSV & Excel", icon: FileSpreadsheet }, { label: "Source profiles", icon: Database },
  { label: "Validated SQL", icon: Braces }, { label: "Computed charts", icon: BarChart3 },
  { label: "Saved dashboards", icon: PanelsTopLeft }, { label: "HTML reports", icon: ShieldCheck },
];

export default async function Home() {
  const sample = parseSalesSource(await readFile(path.join(process.cwd(), "public/sample_data/analysis_flat.csv"), "utf8"));
  return <main id="main" data-home data-home-motion="reduced" className={styles.home}>
    <HomeMotion />
    <PublicHeader home />
    <section className={styles.hero} aria-labelledby="hero-heading">
      <a href="#preview" className={styles.announcement} data-scroll-drift="12"><BarChart3 size={14} /><span>Interactive frontend preview · Included synthetic data</span><ArrowRight size={12} /></a>
      <h1 id="hero-heading" data-scroll-drift="20">Ask your data.<br />See the evidence.</h1>
      <p data-scroll-drift="9">Turn CSV and Excel files into computed answers, clear charts,<br className={styles.desktopBreak} /> and inspectable SQL. Keep every result connected to its source.</p>
      <div className={styles.heroActions}><Link href="/#preview" className={styles.primary}>Explore dashboard</Link><a href="#preview" className={styles.secondary}>Explore the preview<ArrowRight size={14} /></a></div>
    </section>
    <section id="preview" className={styles.previewSection} aria-label="Interactive dashboard preview"><div className={styles.previewStage} data-scroll-depth><div className={styles.previewDepthBadge} aria-hidden="true"><span />LIVE PREVIEW</div><div data-reveal className={styles.previewFrame}><LiveDashboard {...sample}/></div></div><p className={styles.previewCaption} data-scroll-drift="8">Interactive preview · <Link href="/#preview">Explore the dashboard<ArrowUpRight size={12} /></Link></p><div className={styles.tools}><span data-scroll-drift="10">BUILT FOR SOURCE-BACKED ANALYSIS</span><div className={styles.logoViewport}><div className={styles.logoTrack}>{[0,1].map(copy=><div key={copy} aria-hidden={copy===1}>{workflowTools.map(item=><span className={styles.stackTag} key={item.label}><item.icon size={22} strokeWidth={1.5}/>{item.label}</span>)}</div>)}</div></div></div></section>
    <section id="product" className={styles.features}>
      <div data-reveal className={styles.sectionTitle}><span>The workspace</span><h2>From source to insight.</h2><p>Inspect the files, explore a question, and keep the calculation within reach.</p></div>
      <div className={styles.featureGrid}>
        <article data-reveal className={styles.featureCard}><div className={styles.featureCopy}><h3>Know your source</h3><p>Preview the records and review the fields.</p></div><div data-scroll-drift="10" className={styles.liveSource}><SourcePreview rows={sample.rows} columnCount={sample.columnCount}/></div></article>
        <article data-reveal data-reveal-delay="70" id="chat" className={styles.featureCard}><div className={styles.featureCopy}><h3>Questions with context</h3><p>Try calculated answers from the included data.</p></div><div data-scroll-drift="8" className={styles.liveChat}><SampleChat {...sample}/></div></article>
        <article data-reveal data-reveal-delay="140" className={`${styles.featureCard} ${styles.mobileFeature}`}><div className={styles.featureCopy}><h3>Clarity on every screen</h3><p>A responsive view of your sources and results.</p></div><MobilePreview rows={sample.rows}/></article>
        <article data-reveal className={`${styles.featureCard} ${styles.extensionFeature}`}><div className={styles.featureCopy}><span className={styles.featureEyebrow}>SOURCE EXPLORER</span><h3>Explore the detail</h3><p>Filter the records and carry your source context into the analysis workspace.</p><div className={styles.featureActions}><Link href="/#product">Explore sources<ArrowUpRight size={13}/></Link><Link href="/blog">Read the guides<ArrowRight size={13}/></Link></div><div className={styles.featureSummary} aria-label="Included data summary"><div><strong>{sample.rows.length}</strong><span>Records</span></div><div><strong>{new Set(sample.rows.map(row => row.customer)).size}</strong><span>Customers</span></div><div><strong>{new Set(sample.rows.map(row => row.region)).size}</strong><span>Regions</span></div></div><p className={styles.featureFootnote}>Calculated from the included dataset</p></div><div data-scroll-drift="8" className={styles.liveBrowser}><BrowserPreview rows={sample.rows}/></div></article>
      </div>
    </section>
    <WorkflowOrbit rows={sample.rows} />
    <TemplateSections />
    <section id="faq" className={styles.faq}><div data-reveal className={styles.sectionTitle}><span>FAQ</span><h2>A few questions,<br />clear answers.</h2><p>What to know about your sources, analysis, and workspace before getting started.</p><Link href="/blog" className={styles.secondary}>Read the guides<ArrowRight size={14} /></Link></div><div data-reveal data-reveal-delay="90" className={styles.faqList}>{questions.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={16} /></summary><p>{answer}</p></details>)}</div></section>
    <section data-reveal className={styles.bottomCta}><h2>Ready to explore your data?</h2><Link href="/#preview" className={styles.primary}>Explore dashboard<ArrowRight size={15} /></Link></section>
    <HomeActions />
    <footer className={styles.footer}><div><Link className={styles.brand} href="/"><BarChart3 size={28} />DataLens</Link><p>A clearer view of your business data.</p><span className={styles.language}><Globe size={15}/>English</span><div className={styles.socials}><a href="https://github.com/HChandramania/AI-Data-Analyst" aria-label="View the source repository"><Braces size={18}/></a><Link href="/blog" aria-label="Read the project guides"><ArrowUpRight size={19}/></Link></div></div><div><strong>Product</strong><Link href="/#preview">Overview</Link><Link href="/#chat">Analysis</Link><Link href="/#product">Data sources</Link><Link href="/#preview">Dashboards</Link></div><div><strong>Resources</strong><a href="#product">Features</a><a href="#live-workflow">Live workflow</a><a href="#faq">Questions & answers</a><a href="#preview">Product preview</a></div><div><strong>About</strong><a href="#workflow">Analysis workflow</a><Link href="/blog">Project guides</Link><Link href="/#preview">Explore preview</Link></div><div><strong>Workspace</strong><Link href="/#chat">Try the chat</Link><a href="#faq">Data handling</a><a href="#faq">Provider setup</a></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} DataLens.</span><span><i />Frontend preview</span><span>AI Data Analyst · Inspectable results</span></div></footer>
  </main>;
}
