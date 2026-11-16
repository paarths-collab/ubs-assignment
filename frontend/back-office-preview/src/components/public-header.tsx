import Link from "next/link";
import { BarChart3, Braces, ChevronDown, Database, Layers3, PanelsTopLeft, Search, ShieldCheck } from "lucide-react";
import { ColorThemeToggle } from "@/components/color-theme";
import { AppearanceButton } from "@/components/home-actions";
import styles from "@/app/home.module.css";

export function PublicHeader({ home = false }: { home?: boolean }) {
  const section = (id: string) => home ? `#${id}` : `/#${id}`;
  return <header className={styles.header}>
    <Link href={home ? "/#main" : "/"} className={styles.brand} aria-label="DataLens home"><BarChart3 size={30} strokeWidth={1.8} />DataLens</Link>
    <nav aria-label="Website navigation" className={styles.desktopNav}>
      <details className={styles.navDropdown} name="website-navigation"><summary>Product<ChevronDown size={12} /></summary><div>
        <a href={section("product")}><PanelsTopLeft size={17} /><span>Platform overview<small>Explore the interactive workspace</small></span></a>
        <a href={section("live-workflow")}><Braces size={17} /><span>Live workflow<small>Follow sources through to results</small></span></a>
        <Link href="/#chat"><Search size={17} /><span>AI analysis<small>Questions, results, and evidence</small></span></Link>
        <Link href="/#product"><Database size={17} /><span>Data sources<small>Upload and inspect your files</small></span></Link>
      </div></details>
      <details className={styles.navDropdown} name="website-navigation"><summary>Resources<ChevronDown size={12} /></summary><div>
        <a href={section("faq")}><ShieldCheck size={17} /><span>Questions & answers<small>Files, providers, and privacy</small></span></a>
        <Link href="/blog"><Layers3 size={17} /><span>Guides & data<small>Documentation and example data</small></span></Link>
        <Link href="/#preview"><BarChart3 size={17} /><span>Dashboards<small>Revisit completed analyses</small></span></Link>
      </div></details>
      <a href={section("workflow")}>Workflow</a><Link href="/blog" aria-current={home ? undefined : "page"}>Guides</Link>
    </nav>
    <div className={styles.headerActions}><ColorThemeToggle /><AppearanceButton className={styles.previewLink} /><Link href="/#preview" className={styles.primary}>Explore dashboard</Link><details className={styles.mobileMenu}><summary aria-label="Open website navigation"><span /><span /></summary><nav aria-label="Mobile website navigation"><a href={section("product")}>Product</a><a href={section("live-workflow")}>Live workflow</a><a href={section("workflow")}>Workflow</a><Link href="/blog">Guides</Link><a href={section("faq")}>FAQ</a><AppearanceButton className={styles.mobileAppearance}>Appearance & motion</AppearanceButton><Link href="/#preview">Explore preview</Link></nav></details></div>
  </header>;
}
