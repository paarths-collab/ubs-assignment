/**
 * Where this frontend's API lives, for every context the app is served from.
 *
 * Production is deliberately *not* configurable at build time. The deployed
 * app and its API are the same origin — Vercel rewrites `/api/*` to the
 * gateway function alongside the static build — so a relative path is always
 * correct there. An earlier build baked `VITE_API_BASE_URL` in and pointed
 * production at a since-retired backend host, which silently broke every AI
 * call; honouring that variable only outside the browser-served production
 * build removes the whole class of failure.
 *
 * The three remaining contexts:
 *  - Vite dev server: the API is a separate process on :3001, so an absolute
 *    origin. `VITE_API_BASE_URL` can override it for a non-default port.
 *  - Single-file build opened over `file://`: relative paths cannot resolve,
 *    so it falls back to the dev origin (overridable at runtime via
 *    `window.RISK_STREAM_API_BASE` for a demo pointed at a deployed API).
 *  - Anything served over http(s): same origin, i.e. the empty string.
 */
const DEV_API_ORIGIN = "http://localhost:3001";

declare global {
  interface Window {
    /** Runtime override for the offline single-file build. */
    RISK_STREAM_API_BASE?: string;
    /** @deprecated Component 3's original name for the same override. */
    RISK_NETWORK_API_BASE?: string;
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveApiBase(): string {
  const runtimeOverride = (window.RISK_STREAM_API_BASE ?? window.RISK_NETWORK_API_BASE)?.trim();
  if (runtimeOverride) return stripTrailingSlash(runtimeOverride);

  if (import.meta.env.DEV) {
    const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
    return configured ? stripTrailingSlash(configured) : DEV_API_ORIGIN;
  }

  return window.location.protocol === "file:" ? DEV_API_ORIGIN : "";
}
