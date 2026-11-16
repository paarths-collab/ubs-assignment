"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown, Search, X } from "lucide-react";
import { guideGroups, guides } from "./docs-content";
import styles from "./blog.module.css";

export function DocsSidebar() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && pathname?.startsWith("/blog")) {
        event.preventDefault(); input.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [pathname]);
  const needle = query.trim().toLocaleLowerCase();
  const matching = needle ? guides.filter(guide => `${guide.title} ${guide.description} ${guide.category} ${guide.sections.map(section => `${section.title} ${section.paragraphs.join(" ")}`).join(" ")}`.toLocaleLowerCase().includes(needle)) : guides;
  return <aside className={styles.sidebar} aria-label="Documentation navigation">
    <Link href="/blog" className={styles.sidebarTitle}><BookOpen size={17} />Documentation</Link>
    <label className={styles.search}><Search size={15} /><input ref={input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search guides..." aria-label="Search guides" />{query ? <button type="button" onClick={() => { setQuery(""); input.current?.focus(); }} aria-label="Clear search"><X size={13} /></button> : <kbd>⌘ K</kbd>}</label>
    <button type="button" className={styles.browseButton} aria-expanded={mobileOpen || Boolean(query)} aria-controls="guide-navigation" onClick={() => setMobileOpen(open => !open)}>Browse guides <ChevronDown size={15}/></button>
    <nav id="guide-navigation" className={mobileOpen || query ? styles.mobileExpanded : ""} aria-label="Guide articles"><Link href="/blog" className={pathname === "/blog" ? styles.active : ""} aria-current={pathname === "/blog" ? "page" : undefined}>Overview</Link>
      {guideGroups.map(group => {
        const items = matching.filter(guide => guide.category === group);
        return items.length ? <div className={styles.navGroup} key={group}><span>{group}</span>{items.map(guide => <Link key={guide.slug} href={`/blog/${guide.slug}`} className={pathname === `/blog/${guide.slug}` ? styles.active : ""} aria-current={pathname === `/blog/${guide.slug}` ? "page" : undefined}>{guide.title}</Link>)}</div> : null;
      })}
      {matching.length === 0 && <p className={styles.noResults}>No guides match “{query}”.</p>}
    </nav>
    <div className={styles.sidebarFoot}><span>Need a place to begin?</span><Link href="/#product">Open data sources →</Link></div>
  </aside>;
}
