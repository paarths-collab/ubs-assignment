"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { colorPreferenceEvent, colorPreferenceKey, isColorPreference, type ColorPreference } from "@/lib/theme";
import styles from "./color-theme.module.css";

let fallback: ColorPreference = "system";
let temporaryPreference: ColorPreference | null = null;
function preference(): ColorPreference {
  if (temporaryPreference) return temporaryPreference;
  try { const value = localStorage.getItem(colorPreferenceKey); return isColorPreference(value) ? value : fallback; }
  catch { return fallback; }
}
function resolved(): "light" | "dark" {
  const selected = preference();
  return selected === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : selected;
}
function subscribe(change: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (event: StorageEvent) => { if (event.key === colorPreferenceKey || event.key === null) change(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(colorPreferenceEvent, change);
  media.addEventListener("change", change);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(colorPreferenceEvent, change); media.removeEventListener("change", change); };
}
function choose(value: ColorPreference) {
  fallback = value;
  try { localStorage.setItem(colorPreferenceKey, value); temporaryPreference = null; } catch { temporaryPreference = value; }
  window.dispatchEvent(new Event(colorPreferenceEvent));
}
export function useColorMode() {
  return useSyncExternalStore(subscribe, resolved, () => "light" as const);
}
export function ColorThemeController() {
  const mode = useColorMode();
  useEffect(() => {
    const current = resolved();
    document.documentElement.dataset.theme = current;
    document.documentElement.style.colorScheme = current;
  }, [mode]);
  return null;
}
export function ColorThemeToggle() {
  const mode = useColorMode();
  const label = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return <button type="button" className={styles.toggle} aria-label={label} title={label} onClick={() => choose(mode === "dark" ? "light" : "dark")}>{mode === "dark" ? <Sun size={17} strokeWidth={1.6} /> : <Moon size={17} strokeWidth={1.6} />}</button>;
}
export function ColorThemeSelect() {
  const selected = useSyncExternalStore(subscribe, preference, () => "system" as const);
  return <label className={styles.selector}><Sun size={14} /><span className={styles.label}>Color theme</span><select aria-label="Color theme" value={selected} onChange={event => { if (isColorPreference(event.target.value)) choose(event.target.value); }}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>;
}
