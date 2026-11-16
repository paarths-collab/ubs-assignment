"use client";

import { type FormEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mail, Pencil, RotateCcw, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import { ColorThemeSelect } from "@/components/color-theme";
import styles from "./home-actions.module.css";

const contactKey = "dbo:local-contact-requests:v1";
const appearanceKey = "dbo:home-appearance:v1";
const changedEvent = "dbo:home-actions-changed";
const unavailable = "storage-unavailable";
const maxRequests = 20;
const maxContactSize = 80 * 1024;
type ContactRequest = { id: string; name: string; email: string; message: string; source: "homepage" | "enterprise"; createdAt: string; updatedAt: string };
type ContactStore = { version: 1; requests: ContactRequest[] };
type Appearance = { version: 1; accent: "orange" | "neutral"; motion: "system" | "reduced" };
type Notice = { kind: "success" | "error"; text: string };
type TriggerProps = { className?: string; children?: ReactNode };
const defaultAppearance: Appearance = { version: 1, accent: "orange", motion: "system" };
const emptyDraft = { name: "", email: "", message: "" };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isDate = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
const isEmail = (value: unknown): value is string => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isName = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 100;
const isMessage = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 2000;

function readContacts(raw: string | null): ContactStore | null {
  if (raw === null) return { version: 1, requests: [] };
  if (raw === unavailable || raw.length > maxContactSize) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.requests) || value.requests.length > maxRequests) return null;
    const requests: ContactRequest[] = [];
    for (const item of value.requests) {
      if (!isRecord(item) || typeof item.id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(item.id) || !isName(item.name) || !isEmail(item.email) ||
        !isMessage(item.message) || !["homepage", "enterprise"].includes(String(item.source)) || !isDate(item.createdAt) || !isDate(item.updatedAt)) return null;
      requests.push({ id: item.id, name: item.name, email: item.email, message: item.message, source: item.source as ContactRequest["source"], createdAt: item.createdAt, updatedAt: item.updatedAt });
    }
    return new Set(requests.map(item => item.id)).size === requests.length ? { version: 1, requests } : null;
  } catch { return null; }
}

function readAppearance(raw: string | null): Appearance | null {
  if (raw === null) return defaultAppearance;
  if (raw === unavailable || raw.length > 1024) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) && value.version === 1 && (value.accent === "orange" || value.accent === "neutral") && (value.motion === "system" || value.motion === "reduced")
      ? { version: 1, accent: value.accent, motion: value.motion } : null;
  } catch { return null; }
}

function subscribeStorage(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changedEvent, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(changedEvent, notify); };
}
function storageSnapshot(key: string) { try { return localStorage.getItem(key); } catch { return unavailable; } }
function persist(key: string, value: ContactStore | Appearance | null) {
  const serialized = value === null ? null : JSON.stringify(value);
  if (serialized !== null && serialized.length > (key === contactKey ? maxContactSize : 1024)) throw new Error("Stored data exceeds its limit.");
  if (serialized === null) localStorage.removeItem(key);
  else localStorage.setItem(key, serialized);
  if (localStorage.getItem(key) !== serialized) throw new Error("Browser storage did not retain the change.");
  window.dispatchEvent(new Event(changedEvent));
}
function currentContacts() {
  const current = readContacts(storageSnapshot(contactKey));
  if (!current) throw new Error("Saved contact requests could not be read.");
  return current.requests;
}
function identifier() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2, "0")).join("");
}
function outsideDialog(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
}

export function ContactButton({ className, children }: TriggerProps) {
  return <button type="button" className={className} aria-haspopup="dialog" onClick={() => window.dispatchEvent(new CustomEvent("open-contact", { detail: { source: "homepage" } }))}>{children ?? "Contact us"}</button>;
}

export function AppearanceButton({ className, children }: TriggerProps) {
  return <button type="button" className={className ?? styles.appearanceTrigger} aria-label="Appearance settings" title="Appearance settings" aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event("open-appearance"))}>{children ?? <SlidersHorizontal size={19} aria-hidden="true" />}</button>;
}

export function HomeActions() {
  const contact = useRef<HTMLDialogElement>(null);
  const appearanceDialog = useRef<HTMLDialogElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const savedList = useRef<HTMLDetailsElement>(null);
  const contactRaw = useSyncExternalStore(subscribeStorage, () => storageSnapshot(contactKey), () => null);
  const appearanceRaw = useSyncExternalStore(subscribeStorage, () => storageSnapshot(appearanceKey), () => null);
  const contacts = readContacts(contactRaw);
  const storedAppearance = readAppearance(appearanceRaw);
  const [appearanceDraft, setAppearanceDraft] = useState<Appearance | null>(null);
  const appearance = appearanceDraft ?? storedAppearance ?? defaultAppearance;
  const [draft, setDraft] = useState(emptyDraft);
  const [source, setSource] = useState<ContactRequest["source"]>("homepage");
  const [editing, setEditing] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [appearanceNotice, setAppearanceNotice] = useState<Notice | null>(null);
  const requests = contacts?.requests ?? [];
  const contactProblem = contactRaw === unavailable ? "Browser storage is unavailable. Requests cannot be restored or saved until storage is enabled." : !contacts ? "Saved requests could not be read. Remove the unreadable local data before saving a new request." : "";
  const appearanceProblem = appearanceRaw === unavailable ? "Saved appearance settings could not be read. Changes can still apply for this visit." : !storedAppearance ? "Saved appearance settings are unreadable. Choose a new setting or restore defaults." : "";

  useEffect(() => {
    function openContact(event: Event) {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      setSource(isRecord(detail) && detail.source === "enterprise" ? "enterprise" : "homepage");
      setDraft(emptyDraft); setEditing(null); setConsent(false); setNotice(null);
      appearanceDialog.current?.close();
      if (!contact.current?.open) contact.current?.showModal();
      nameField.current?.focus();
    }
    function openAppearance() {
      contact.current?.close(); setAppearanceNotice(null);
      if (!appearanceDialog.current?.open) appearanceDialog.current?.showModal();
    }
    window.addEventListener("open-contact", openContact);
    window.addEventListener("open-appearance", openAppearance);
    return () => { window.removeEventListener("open-contact", openContact); window.removeEventListener("open-appearance", openAppearance); };
  }, []);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>("main[data-home]");
    if (!main) return;
    // Read the browser preference on the first effect, before enabling motion.
    const resolvedAppearance = appearanceDraft ?? readAppearance(storageSnapshot(appearanceKey)) ?? defaultAppearance;
    const previous = { accent: main.dataset.homeAccent, motion: main.dataset.homeMotion, ready: main.dataset.homeMotionReady, orange: main.style.getPropertyValue("--orange"), homeAccent: main.style.getPropertyValue("--home-accent"), hadClass: main.classList.contains(styles.appearanceScope) };
    main.classList.add(styles.appearanceScope);
    main.dataset.homeAccent = "orange";
    main.dataset.homeMotion = resolvedAppearance.motion;
    main.dataset.homeMotionReady = "true";
    const accent = "var(--theme-accent, #c7501b)";
    main.style.setProperty("--home-accent", accent);
    main.style.setProperty("--orange", accent);
    return () => {
      if (!previous.hadClass) main.classList.remove(styles.appearanceScope);
      if (previous.accent === undefined) delete main.dataset.homeAccent; else main.dataset.homeAccent = previous.accent;
      if (previous.motion === undefined) delete main.dataset.homeMotion; else main.dataset.homeMotion = previous.motion;
      if (previous.ready === undefined) delete main.dataset.homeMotionReady; else main.dataset.homeMotionReady = previous.ready;
      if (previous.orange) main.style.setProperty("--orange", previous.orange); else main.style.removeProperty("--orange");
      if (previous.homeAccent) main.style.setProperty("--home-accent", previous.homeAccent); else main.style.removeProperty("--home-accent");
    };
  }, [appearance.accent, appearance.motion, appearanceDraft]);

  function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = { name: draft.name.trim(), email: draft.email.trim(), message: draft.message.trim() };
    if (!isName(values.name) || !isEmail(values.email) || !isMessage(values.message) || !consent) {
      setNotice({ kind: "error", text: "Complete the name, email and request fields, and confirm local storage consent." }); return;
    }
    try {
      const existing = currentContacts();
      const original = editing ? existing.find(item => item.id === editing) : null;
      if (editing && !original) { setNotice({ kind: "error", text: "That request was removed in another tab. Cancel editing to create a new request." }); return; }
      if (!editing && existing.length >= maxRequests) { setNotice({ kind: "error", text: "This browser already has 20 saved requests. Remove an existing request before adding another." }); if (savedList.current) savedList.current.open = true; return; }
      const now = new Date().toISOString();
      const item: ContactRequest = { ...values, id: original?.id ?? identifier(), source: original?.source ?? source, createdAt: original?.createdAt ?? now, updatedAt: now };
      persist(contactKey, { version: 1, requests: original ? existing.map(entry => entry.id === item.id ? item : entry) : [item, ...existing] });
      setNotice({ kind: "success", text: `Request ${item.id} ${original ? "updated" : "saved"} locally. No message was sent.` });
      setDraft(emptyDraft); setEditing(null); setConsent(false);
      if (savedList.current) savedList.current.open = true;
    } catch { setNotice({ kind: "error", text: "The request could not be saved. Check browser storage and the saved-request notice, then try again." }); }
  }
  function edit(item: ContactRequest) {
    setDraft({ name: item.name, email: item.email, message: item.message }); setEditing(item.id); setSource(item.source); setConsent(false); setNotice(null); nameField.current?.focus();
  }
  function remove(id: string) {
    try {
      const existing = currentContacts();
      persist(contactKey, { version: 1, requests: existing.filter(item => item.id !== id) });
      if (editing === id) { setDraft(emptyDraft); setEditing(null); setConsent(false); }
      setNotice({ kind: "success", text: `Request ${id} removed from this browser.` });
    } catch { setNotice({ kind: "error", text: "The request could not be removed. Check browser storage and try again." }); }
  }
  function clearUnreadableContacts() {
    if (!window.confirm("Remove the unreadable saved contact data from this browser? This cannot be undone.")) return;
    try { persist(contactKey, null); setNotice({ kind: "success", text: "Unreadable local contact data removed." }); }
    catch { setNotice({ kind: "error", text: "Local contact data could not be removed. Check browser storage permissions." }); }
  }
  function changeAppearance(next: Appearance) {
    setAppearanceDraft(next);
    try { persist(appearanceKey, next); setAppearanceDraft(null); setAppearanceNotice({ kind: "success", text: "Appearance settings saved in this browser." }); }
    catch { setAppearanceNotice({ kind: "error", text: "Applied for this visit. Browser storage is unavailable, so the settings could not be saved." }); }
  }
  function resetAppearance() {
    setAppearanceDraft(defaultAppearance);
    try { persist(appearanceKey, null); setAppearanceDraft(null); setAppearanceNotice({ kind: "success", text: "Default motion preference restored for this browser." }); }
    catch { setAppearanceNotice({ kind: "error", text: "Defaults applied for this visit. Saved settings could not be removed." }); }
  }

  return <>
    <dialog ref={contact} className={styles.dialog} aria-labelledby="home-contact-title" aria-describedby="home-contact-description" onClick={outsideDialog}>
      <div className={styles.dialogHeading}><div><span className={styles.eyebrow}>{source === "enterprise" ? "ENTERPRISE INQUIRY" : "LOCAL CONTACT REQUEST"}</span><h2 id="home-contact-title">{editing ? "Edit saved request" : "Contact us"}</h2></div><button type="button" className={styles.close} aria-label="Close contact form" onClick={() => contact.current?.close()}><X size={19} aria-hidden="true" /></button></div>
      <p id="home-contact-description" className={styles.description}>Save what you’d like to discuss as a local request on this browser.</p>
      <p className={styles.localNote}><Mail size={15} aria-hidden="true" /><span>Requests stay on this device. No email or message is sent, and no support response is scheduled.</span></p>
      {contactProblem && <div className={styles.warning} role="alert"><p>{contactProblem}</p>{contactRaw !== unavailable && <button type="button" onClick={clearUnreadableContacts}>Remove unreadable local data</button>}</div>}
      <form className={styles.contactForm} onSubmit={saveContact}>
        <div className={styles.formRow}><label>Name<input ref={nameField} name="contact-name" autoComplete="name" required maxLength={100} value={draft.name} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))} /></label><label>Email<input name="contact-email" type="email" autoComplete="email" required maxLength={254} value={draft.email} onChange={event => setDraft(previous => ({ ...previous, email: event.target.value }))} /></label></div>
        <label>What would you like to discuss?<textarea name="contact-message" required maxLength={2000} rows={4} value={draft.message} onChange={event => setDraft(previous => ({ ...previous, message: event.target.value }))} /></label>
        <label className={styles.consent}><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I agree to save these contact details in this browser. Anyone using this browser profile may view them.</span></label>
        <div className={styles.formActions}>{editing && <button type="button" className={styles.secondary} onClick={() => { setDraft(emptyDraft); setEditing(null); setConsent(false); setNotice(null); }}>Cancel editing</button>}<button type="submit" className={styles.primary}><Save size={14} aria-hidden="true" />{editing ? "Save changes locally" : "Save locally"}</button></div>
      </form>
      <div className={`${styles.notice} ${notice?.kind === "error" ? styles.noticeError : ""}`} role={notice?.kind === "error" ? "alert" : "status"} aria-live="polite">{notice?.text}</div>
      <details className={styles.savedRequests} ref={savedList}><summary>Saved requests<span>{requests.length} / {maxRequests}</span></summary>
        {requests.length ? <ul>{requests.map(item => <li key={item.id}><div className={styles.requestHeading}><strong>{item.name}</strong><span>{new Date(item.updatedAt).toLocaleString()}</span></div><p className={styles.requestEmail}>{item.email}</p><p className={styles.requestMessage}>{item.message}</p><code>ID: {item.id}</code><div className={styles.requestActions}><button type="button" onClick={() => edit(item)}><Pencil size={12} aria-hidden="true" />Edit<span className={styles.srOnly}> request {item.id}</span></button><button type="button" onClick={() => remove(item.id)}><Trash2 size={12} aria-hidden="true" />Remove<span className={styles.srOnly}> request {item.id}</span></button></div></li>)}</ul> : <p className={styles.empty}>No contact requests saved in this browser.</p>}
      </details>
    </dialog>

    <dialog ref={appearanceDialog} className={`${styles.dialog} ${styles.appearanceDialog}`} aria-labelledby="home-appearance-title" onClick={outsideDialog}>
      <div className={styles.dialogHeading}><div><span className={styles.eyebrow}>THIS BROWSER</span><h2 id="home-appearance-title">Appearance</h2></div><button type="button" className={styles.close} aria-label="Close appearance settings" onClick={() => appearanceDialog.current?.close()}><X size={19} aria-hidden="true" /></button></div>
      <p className={styles.description}>Choose the site’s color theme and this homepage’s motion preference.</p>
      {appearanceProblem && <p className={styles.warning} role="alert">{appearanceProblem}</p>}
      <div className={styles.themeOptions}><ColorThemeSelect /><p>White or black surfaces, with orange accents in both modes.</p></div>
      <label className={styles.motionSetting}><span><strong>Reduce motion</strong><small>Stop homepage animations and transitions. When off, your system preference still applies.</small></span><input type="checkbox" checked={appearance.motion === "reduced"} onChange={event => changeAppearance({ ...appearance, motion: event.target.checked ? "reduced" : "system" })} /></label>
      <p className={styles.settingsNote}>The color theme applies across the site. Reduced motion applies to this homepage. Preferences stay in this browser.</p>
      <div className={`${styles.notice} ${appearanceNotice?.kind === "error" ? styles.noticeError : ""}`} role={appearanceNotice?.kind === "error" ? "alert" : "status"} aria-live="polite">{appearanceNotice?.text}</div>
      <div className={styles.appearanceFooter}><button type="button" className={styles.secondary} onClick={resetAppearance}><RotateCcw size={13} aria-hidden="true" />Reset motion</button><button type="button" className={styles.primary} onClick={() => appearanceDialog.current?.close()}>Done</button></div>
    </dialog>
  </>;
}
