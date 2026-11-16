"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDownLeft, ArrowUpRight, ChartNoAxesCombined, ChevronRight, Command, Database, Fingerprint, ListChecks, Activity, HelpCircle, History, LayoutDashboard, LockKeyhole, Menu, Plus, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { SignOut } from "@/components/signout";
import { ColorThemeSelect } from "@/components/color-theme";
import { OperationalConnection } from "@/components/operational-connection";
import { Availability } from "@/components/availability";
import { AuthPreview } from "@/components/auth-preview";
import styles from "./workspace-shell.module.css";

const accountNavigation = [
  { href: "/overview", label: "Overview", description: "Your source snapshot, at a glance", icon: LayoutDashboard },
  { href: "/analyze", label: "Ask your data", description: "Explore with natural language", icon: Sparkles },
  { href: "/datasets", label: "Data sources", description: "Upload, inspect and manage files", icon: Database },
  { href: "/dashboards", label: "Dashboards", description: "Your saved insights and reports", icon: ChartNoAxesCombined },
];

const operationalNavigation = [
  ...accountNavigation.map(item => ({ ...item, href: `/workspace${item.href}`, description: item.href === "/datasets" ? "Inspect the verified event source" : item.href === "/dashboards" ? "Computed views and local data snapshots" : item.description })),
  { href: "/workspace/investigate", label: "Priority signals", description: "Investigate priorities and their source evidence", icon: Fingerprint },
  { href: "/workspace/issues", label: "Issue library", description: "Ranked issues, recurring patterns, and investigations", icon: ListChecks },
  { href: "/workspace/timeline", label: "Event history", description: "Explore recorded activity through time", icon: Activity },
];

const mobileQuery = "(max-width: 700px)";
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function subscribeMobile(change: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}
function mobileSnapshot() { return window.matchMedia(mobileQuery).matches; }
function serverMobileSnapshot() { return false; }

export function WorkspaceShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const operational = pathname.startsWith("/workspace/");
  const navigation = operational ? operationalNavigation : accountNavigation;
  const workspaceHref = (href: string) => operational ? `/workspace${href}` : href;
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, serverMobileSnapshot);
  const drawerOpen = mobile && mobileOpen;
  const [search, setSearch] = useState("");
  const sidebar = useRef<HTMLElement>(null);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const command = useRef<HTMLDialogElement>(null);
  const help = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const auth = pathname === "/login" || pathname === "/register";
  const accountPage = accountNavigation.some(item => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const publicHome = !auth && !operational && !accountPage;
  const page = navigation.find(item => pathname.startsWith(item.href)) ?? navigation[0];
  useEffect(() => {
    const showHelp = () => { if (help.current && !help.current.open) help.current.showModal(); };
    window.addEventListener("open-workspace-help", showHelp);
    return () => window.removeEventListener("open-workspace-help", showHelp);
  }, []);
  useEffect(() => {
    if (!drawerOpen || auth || publicHome) return;
    const panel = sidebar.current;
    if (!panel) return;
    const toggle = mobileToggle.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...panel.querySelectorAll<HTMLElement>(focusableSelector)].filter(element => element.getClientRects().length > 0);
    (focusable()[0] ?? panel).focus();
    const previousOverflow = document.body.style.overflow;
    const globalNavigation = document.getElementById("datalens-global-navigation");
    const previousInert = globalNavigation?.inert ?? false;
    if (globalNavigation) globalNavigation.inert = true;
    document.body.style.overflow = "hidden";
    function onDrawerKey(event: KeyboardEvent) {
      // Native modal dialogs opened from the drawer own their keyboard focus.
      if (command.current?.open || help.current?.open) return;
      if (event.key === "Escape") {
        event.preventDefault(); setMobileOpen(false);
      } else if (event.key === "Tab") {
        const controls = focusable();
        const first = controls[0], last = controls[controls.length - 1];
        if (!first || !last) { event.preventDefault(); panel?.focus(); return; }
        if (!panel?.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener("keydown", onDrawerKey);
    return () => {
      document.removeEventListener("keydown", onDrawerKey);
      document.body.style.overflow = previousOverflow;
      if (globalNavigation) globalNavigation.inert = previousInert;
      const visibleToggle = toggle?.isConnected && toggle.getClientRects().length ? toggle : null;
      const navigationTarget = panel.isConnected ? panel.querySelector<HTMLElement>(focusableSelector) : null;
      const target = visibleToggle ?? navigationTarget
        ?? (previousFocus?.isConnected && !previousFocus.closest("[inert]") ? previousFocus : null);
      target?.focus({ preventScroll: true });
    };
  }, [drawerOpen, auth, publicHome]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "k" && !auth && !publicHome) {
        event.preventDefault();
        if (command.current?.open) command.current.close();
        else { command.current?.showModal(); searchInput.current?.focus(); }
      }
      if (/^[1-7]$/.test(event.key) && navigation[Number(event.key) - 1] && !auth && !publicHome) {
        event.preventDefault(); setMobileOpen(false); router.push(navigation[Number(event.key) - 1].href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, auth, publicHome, navigation]);
  function navigate(href: string) {
    command.current?.close(); help.current?.close(); setSearch(""); setMobileOpen(false); router.push(operational && /^\/(overview|analyze|datasets|dashboards)(?:[?#]|$)/.test(href) ? `/workspace${href}` : href);
  }
  if (publicHome) return <>{children}</>;
  if (auth) return <div className={styles.authShell}>
    <section className={styles.authArt}>
      <Link href="/login" className={styles.authBrand}><span className={styles.logo}><ChartNoAxesCombined size={18} strokeWidth={2.4} /></span>DataLens<span className={styles.brandTag}>WORKSPACE</span></Link>
      <div className={styles.authCopy}><div className={styles.authPill}>DATA ANALYSIS WORKSPACE</div>
        <h1>Understand your data.<br /><span>Make informed decisions.</span></h1>
        <p>Explore your sources, ask focused questions, and review the calculations behind every result.</p>
      </div>
      <div className={styles.authShowcase}><AuthPreview /></div>
      <p className={styles.authBottom}><LockKeyhole size={12} />Private workspace. Verifiable answers.</p>
    </section>
    <div className={styles.authForm}>{children}<div className={styles.authFormFooter}><ColorThemeSelect /></div></div>
  </div>;
  return <div className={styles.shell}>
    {drawerOpen && <button className={styles.backdrop} tabIndex={-1} aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside ref={sidebar} id="workspace-navigation" tabIndex={-1} inert={mobile && !drawerOpen} aria-hidden={mobile && !drawerOpen ? true : undefined}
      role={drawerOpen ? "dialog" : undefined} aria-modal={drawerOpen ? true : undefined} aria-label="Workspace navigation"
      className={`${styles.sidebar} ${drawerOpen ? styles.open : ""}`}>
      <Link href={workspaceHref("/overview")} className={styles.workspaceBrand} onClick={() => setMobileOpen(false)}><span className={styles.logo}><ChartNoAxesCombined size={18} strokeWidth={2.4} /></span><span>DataLens<span className={styles.workspaceName}>{operational ? "Connected analysis" : "Personal workspace"}</span></span></Link>
      <button className={styles.mobileClose} aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={17} /></button>
      <button className={styles.search} onClick={() => { command.current?.showModal(); searchInput.current?.focus(); }}><Search size={15} /><span>Quick search</span><kbd>⌘ K</kbd></button>
      <button className={styles.newAnalysis} onClick={() => { window.dispatchEvent(new Event("new-analysis")); navigate("/analyze"); }}><Plus size={15} />New analysis<ArrowUpRight size={13} /></button>
      <p className={styles.navLabel}>WORKSPACE</p>
      <nav className={styles.nav} aria-label="Main navigation">{navigation.map((item, i) => <Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href) ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`${styles.navLink} ${pathname.startsWith(item.href) ? styles.active : ""}`}><item.icon size={16} strokeWidth={1.7} /><span>{item.label}</span><kbd>⌘{i + 1}</kbd></Link>)}</nav>
      <p className={styles.navLabel}>EXPLORE</p><div className={styles.tools}><button onClick={() => { setMobileOpen(false); if (operational) navigate("/analyze"); else if (pathname.startsWith("/analyze")) window.dispatchEvent(new Event("open-insight-history")); else navigate("/analyze?history=1"); }}><History size={15} />{operational ? "Analysis & evidence" : "History & search"}<ArrowUpRight size={11} /></button><Link href={workspaceHref("/datasets#source-health")} onClick={() => setMobileOpen(false)}><ShieldCheck size={15} />Data quality<ArrowUpRight size={11} /></Link><button onClick={() => help.current?.showModal()}><HelpCircle size={15} />Connections & help<ChevronRight size={11} /></button></div>
      <div className={styles.sidebarBottom}>
        <div className={styles.insightNote}><LockKeyhole size={14} /><span>{operational ? "Verified source data" : "Private workspace"}</span><p>{operational ? "Synthetic operational events from the connected analysis backend." : "Files and saved results are scoped to your account."}</p></div>
        <div className={styles.account}><div className={styles.avatar}>A</div><div><strong>Analyst</strong><small>{operational ? "Analysis workspace" : "Local account"}</small></div>{operational ? <Link href="/" aria-label="Back to home"><ArrowUpRight size={16} /></Link> : <SignOut />}</div>
      </div>
    </aside>
    <div className={styles.workspace} inert={drawerOpen}>
      <header className={styles.header}><button ref={mobileToggle} className={styles.mobileToggle} aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={drawerOpen} onClick={() => setMobileOpen(value => !value)}><Menu size={19} /></button><div className={styles.breadcrumb}><span>Workspace</span><ChevronRight size={12} /><strong>{page.label}</strong></div><div className={styles.headerActions}><span className={styles.localBadge}><span />Local workspace</span><button aria-label="Search workspace" className={styles.iconButton} onClick={() => { command.current?.showModal(); searchInput.current?.focus(); }}><Search size={15} /></button><button aria-label="Help and connections" className={styles.headerAvatar} onClick={() => help.current?.showModal()}>A</button></div></header>
      <div className={styles.page}>{children}</div>
    </div>
    <dialog ref={command} className={styles.commandDialog} aria-labelledby="command-title" onClick={event => { if (event.target === event.currentTarget) command.current?.close(); }}>
      <h2 id="command-title" className="visually-hidden">Search workspace</h2><div className={styles.commandInput}><Search size={19} /><input ref={searchInput} aria-label="Find a page" value={search} onChange={event => setSearch(event.target.value)} placeholder="Where would you like to go?" /><button aria-label="Close search" onClick={() => command.current?.close()}><X size={16} /></button></div><div className={styles.commandResults}>{navigation.filter(item => `${item.label} ${item.description}`.toLowerCase().includes(search.toLowerCase())).map(item => <button key={item.href} onClick={() => navigate(item.href)}><item.icon size={19} /><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowDownLeft size={14} /></button>)}{!navigation.some(item => `${item.label} ${item.description}`.toLowerCase().includes(search.toLowerCase())) && <p>No pages found. Try “data” or “overview”.</p>}</div><div className={styles.commandFooter}><Command size={12} />Quick navigation<span>esc to close</span></div>
    </dialog>
    <dialog ref={help} className={`app-dialog ${styles.helpDialog}`} aria-labelledby="help-title"><div className="dialog-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="help-title">Workspace help</h2></div><button className="dialog-close" aria-label="Close help" onClick={() => help.current?.close()}><X size={19} /></button></div><p>{operational ? "Inspect the verified source, compare computed charts, and ask for an evidence-grounded analysis." : "Upload a CSV or Excel file, inspect its quality, then ask a question in plain English."}</p><div className={styles.helpActions}><button onClick={() => navigate("/datasets")}><Database size={16} /><strong>Inspect your sources</strong><span>Profiles, previews, and quality</span><ArrowUpRight size={13} /></button><button onClick={() => navigate("/analyze")}><Sparkles size={16} /><strong>Explore a question</strong><span>{operational ? "Computed facts and grounded interpretation" : "Charts, joins, SQL, and outliers"}</span><ArrowUpRight size={13} /></button><button onClick={() => navigate("/dashboards")}><LayoutDashboard size={16} /><strong>{operational ? "Explore your findings" : "Save your findings"}</strong><span>{operational ? "Computed charts and local JSON snapshots" : "Dashboards and HTML reports"}</span><ArrowUpRight size={13} /></button></div><h3>Analysis and evidence</h3>{operational ? <p>Charts and source records are calculated by the connected analysis backend. AI interpretation requires its configured provider. Account uploads and saved conversations belong to the separate full-application backend.</p> : <p>New AI answers require a configured provider. File uploads, profiles, and the source overview work without a key.</p>}<h3>Check your local connection</h3>{operational ? <OperationalConnection /> : <Availability />}<div className={styles.shortcuts}><span>Search pages<kbd>⌘ / Ctrl + K</kbd></span><span>Switch pages<kbd>⌘ / Ctrl + {operational ? "1–7" : "1–4"}</kbd></span></div></dialog>
  </div>;
}
