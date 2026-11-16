export type Route = "home" | "kpi" | "streamgraph" | "patterns" | "issues" | "graph";

/**
 * Resolves the current route from the URL. Path-based routes (/streamgraph,
 * /patterns) are used when served over http(s) — Vite's dev server and any
 * static host with SPA fallback serve index.html for them. When the
 * single-file build is opened straight off disk (file://) there is no
 * server to do that fallback, so hash routes (#/streamgraph, #/patterns) are
 * used instead; both forms are accepted here so links keep working either
 * way.
 */
export function currentRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "").trim();
  if (hash.length > 0) {
    return routeFromSegment(hash);
  }
  const path = window.location.pathname.replace(/\/+$/, "");
  return routeFromSegment(path.slice(path.lastIndexOf("/") + 1));
}

function routeFromSegment(segment: string): Route {
  if (segment === "streamgraph") return "streamgraph";
  if (segment === "kpi") return "kpi";
  if (segment === "patterns") return "patterns";
  if (segment === "issues") return "issues";
  if (segment === "graph") return "graph";
  return "home";
}

function supportsPathRouting(): boolean {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

export function hrefFor(route: Route): string {
  const path = route === "home" ? "/" : `/${route}`;
  return supportsPathRouting() ? path : `#${path}`;
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
