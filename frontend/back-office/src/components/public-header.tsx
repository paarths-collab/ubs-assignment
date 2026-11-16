"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, BarChart3, BookOpen, ChevronDown, Database, Fingerprint, LayoutDashboard, ListChecks, Menu, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { ColorThemeToggle } from "@/components/color-theme";
import { AppearanceButton, HomeActions } from "@/components/home-actions";
import styles from "./global-navigation.module.css";

const primaryLinks = [
  { href: "/workspace/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/workspace/analyze", label: "Ask your data", icon: Sparkles },
  { href: "/workspace/datasets", label: "Data sources", icon: Database },
  { href: "/workspace/dashboards", label: "Dashboards", icon: BarChart3 },
];
const moreLinks = [
  { href: "/workspace/investigate", label: "Priority signals", description: "Priorities and supporting evidence", icon: Fingerprint },
  { href: "/workspace/issues", label: "Issues & patterns", description: "Ranked issues and source records", icon: ListChecks },
  { href: "/workspace/timeline", label: "Event history", description: "Recorded activity through time", icon: Activity },
  { href: "/blog", label: "Guides", description: "Documentation and example workflows", icon: BookOpen },
];

/** One navigation surface mounted by the root layout, across public and workspace routes. */
export function PublicHeader() {
  const pathname = usePathname() ?? "";
  // Route keys close navigation and remount appearance bindings after client-side navigation.
  return <><Navigation key={pathname} pathname={pathname} /><HomeActions key={`appearance:${pathname}`} /></>;
}

function Navigation({ pathname }: { pathname: string }) {
  const more = useRef<HTMLDetailsElement>(null);
  const mobileDialog = useRef<HTMLDialogElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const previousOverflow = useRef<string | null>(null);
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = moreLinks.some(link => active(link.href));

  function closeMore() { if (more.current) more.current.open = false; }
  function restoreScroll() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }
  function closeMobile() {
    mobileDialog.current?.close();
    restoreScroll();
    setMobileOpen(false);
  }
  function openMobile() {
    closeMore();
    if (!mobileDialog.current?.open) {
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      mobileDialog.current?.showModal();
      setMobileOpen(true);
    }
  }
  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (event.target instanceof Node && !more.current?.contains(event.target)) closeMore();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && more.current?.open) {
        event.preventDefault(); closeMore(); more.current.querySelector("summary")?.focus();
      }
    }
    const dialog = mobileDialog.current;
    function onDesktop(event: MediaQueryListEvent) { if (event.matches) dialog?.close(); }
    const media = window.matchMedia("(min-width: 1001px)");
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    media.addEventListener("change", onDesktop);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onDesktop);
      dialog?.close();
      if (previousOverflow.current !== null) document.body.style.overflow = previousOverflow.current;
    };
  }, []);

  return <>
    <header id="datalens-global-navigation" className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="DataLens home" aria-current={pathname === "/" ? "page" : undefined}><BarChart3 size={27} strokeWidth={1.8} aria-hidden="true" /><span>DataLens</span></Link>
        <nav className={styles.desktopNav} aria-label="Global navigation">
          {primaryLinks.map(link => <Link key={link.href} href={link.href} aria-current={active(link.href) ? "page" : undefined}>{link.label}</Link>)}
          <details ref={more} className={styles.more} onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) closeMore(); }}>
            <summary className={moreActive ? styles.current : undefined}>More<ChevronDown size={12} aria-hidden="true" /></summary>
            <div className={styles.dropdown}>{moreLinks.map(link => <Link key={link.href} href={link.href} aria-current={active(link.href) ? "page" : undefined} onClick={closeMore}><link.icon size={16} aria-hidden="true" /><span>{link.label}<small>{link.description}</small></span></Link>)}</div>
          </details>
        </nav>
        <div className={styles.actions}><ColorThemeToggle /><AppearanceButton className={styles.appearance} /><Link href="/login" className={styles.account} aria-current={pathname === "/login" ? "page" : undefined}>Account<ArrowUpRight size={12} aria-hidden="true" /></Link><button ref={mobileTrigger} type="button" className={styles.mobileTrigger} aria-label="Open global navigation" aria-haspopup="dialog" aria-controls="global-mobile-navigation" aria-expanded={mobileOpen} onClick={openMobile}><Menu size={20} aria-hidden="true" /></button></div>
      </div>
    </header>
    <dialog ref={mobileDialog} id="global-mobile-navigation" className={styles.mobileDialog} aria-labelledby="global-mobile-title" onClose={() => { restoreScroll(); setMobileOpen(false); if (mobileTrigger.current?.getClientRects().length) mobileTrigger.current.focus(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMobile();
    }}>
      <div className={styles.mobileHeading}><h2 id="global-mobile-title"><BarChart3 size={22} aria-hidden="true" />DataLens navigation</h2><button type="button" onClick={closeMobile} aria-label="Close global navigation"><X size={19} aria-hidden="true" /></button></div>
      <nav className={styles.mobileLinks} aria-label="Mobile global navigation"><span>WORKSPACE</span>{primaryLinks.map(link => <Link key={link.href} href={link.href} aria-current={active(link.href) ? "page" : undefined} onClick={closeMobile}><link.icon size={16} aria-hidden="true" />{link.label}<ArrowUpRight size={12} aria-hidden="true" /></Link>)}<span>EXPLORE</span>{moreLinks.map(link => <Link key={link.href} href={link.href} aria-current={active(link.href) ? "page" : undefined} onClick={closeMobile}><link.icon size={16} aria-hidden="true" />{link.label}<ArrowUpRight size={12} aria-hidden="true" /></Link>)}</nav>
      <div className={styles.mobileFooter}><button type="button" onClick={() => { closeMobile(); window.dispatchEvent(new Event("open-appearance")); }}><SlidersHorizontal size={15} aria-hidden="true" />Appearance & motion</button><Link href="/login" onClick={closeMobile}>Account sign in<ArrowUpRight size={12} aria-hidden="true" /></Link></div>
    </dialog>
  </>;
}
