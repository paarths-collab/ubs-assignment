export type Route = "home" | "streamgraph";

/**
 * Resolves the current route from the URL. Path-based routes (/streamgraph)
 * are used when served over http(s) — Vite's dev server and any static host
 * with SPA fallback serve index.html for them. When the single-file build is
 * opened straight off disk (file://) there is no server to do that fallback,
 * so hash routes (#/streamgraph) are used instead; both forms are accepted
 * here so links keep working either way.
 */
export function currentRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "").trim();
  if (hash.length > 0) {
    return hash === "streamgraph" ? "streamgraph" : "home";
  }
  const path = window.location.pathname.replace(/\/+$/, "");
  return path.endsWith("/streamgraph") ? "streamgraph" : "home";
}

function supportsPathRouting(): boolean {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

export function hrefFor(route: Route): string {
  if (!supportsPathRouting()) return route === "home" ? "#/" : "#/streamgraph";
  return route === "home" ? "/" : "/streamgraph";
}

export function navigate(route: Route): void {
  if (supportsPathRouting()) {
    window.history.pushState({}, "", hrefFor(route));
    window.dispatchEvent(new PopStateEvent("popstate"));
  } else {
    window.location.hash = hrefFor(route);
  }
}

export function onRouteChange(listener: () => void): void {
  window.addEventListener("popstate", listener);
  window.addEventListener("hashchange", listener);
}
