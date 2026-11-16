export type ColorPreference = "light" | "dark" | "system";
export const colorPreferenceKey = "dbo:theme:v1";
export const colorPreferenceEvent = "dbo:theme-changed";
export const isColorPreference = (value: unknown): value is ColorPreference => value === "light" || value === "dark" || value === "system";

// Runs before page content is painted; only a validated appearance preference is read.
export const initializeColorTheme = `(function(){try{var p=localStorage.getItem('${colorPreferenceKey}');if(p!=='light'&&p!=='dark')p='system';var t=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;
