export type Route = "kpi";

/**
 * Single-route app served at /kpi, mirroring the /streamgraph convention
 * used by the sibling Component 2 app. Path-based when served over
 * http(s) (Vite's dev server, and any static host with SPA fallback);
 * falls back to a hash route for a file:// single-file build, where there
 * is no server to rewrite an unknown path back to index.html.
 */
export function hrefFor(_route: Route): string {
  return supportsPathRouting() ? "/kpi" : "#/kpi";
}

function supportsPathRouting(): boolean {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

/**
 * The main Risk Stream Explorer app, which the deployment serves at the
 * root while this app sits at /kpi.
 *
 * Returns null when there is nothing to link to: over file:// the two apps
 * are separate single-file bundles with no shared root, and on this app's
 * own Vite dev server the root *is* this app — a "back" link in either case
 * would be a dead end, so the caller omits the control entirely.
 */
export function mainAppHref(): string | null {
  if (!supportsPathRouting()) return null;
  return import.meta.env.DEV ? null : "/";
}

/** Rewrites the current URL to the canonical /kpi form without a page reload. */
export function normalizeUrl(): void {
  if (supportsPathRouting()) {
    const path = window.location.pathname.replace(/\/+$/, "");
    if (!path.endsWith("/kpi")) {
      window.history.replaceState({}, "", "/kpi");
    }
  } else if (window.location.hash.replace(/^#\/?/, "").trim() !== "kpi") {
    window.location.hash = "#/kpi";
  }
}
