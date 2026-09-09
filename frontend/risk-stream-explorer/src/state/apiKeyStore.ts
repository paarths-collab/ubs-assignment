const STORAGE_KEY = "risk-stream-explorer.groq-api-key";

/**
 * The Groq API key lives only in this browser's localStorage — it is never
 * embedded in the shipped HTML file and never leaves the browser except in
 * the user's own direct request to Groq. Each viewer must supply their own key.
 */
export function getApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setApiKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    // Storage unavailable (private browsing, quota) — key simply won't persist across reloads.
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
