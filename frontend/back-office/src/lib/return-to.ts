export const DEFAULT_RETURN_TO = "/overview";

/** Accept only existing workspace routes, preserving their query and fragment. */
export function workspaceReturnTo(value: string | null | undefined): string {
  if (!value || value.length > 4096 || [...value].some(character => {
    const code = character.charCodeAt(0);
    return character === "\\" || code < 32 || (code >= 127 && code <= 159);
  }) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) return DEFAULT_RETURN_TO;

  const pathname = value.split(/[?#]/, 1)[0];
  const workspace = /^\/(?:overview|analyze|datasets|dashboards)\/?$/;
  const savedDashboard = /^\/dashboards\/[a-zA-Z0-9_-]+\/?$/;
  return workspace.test(pathname) || savedDashboard.test(pathname) ? value : DEFAULT_RETURN_TO;
}

export function browserReturnTo(): string {
  return workspaceReturnTo(new URLSearchParams(window.location.search).get("next"));
}

export function subscribeReturnTo(change: () => void): () => void {
  window.addEventListener("popstate", change);
  return () => window.removeEventListener("popstate", change);
}

export function serverReturnTo(): string { return DEFAULT_RETURN_TO; }

export function authSwitchHref(path: "/login" | "/register", destination: string): string {
  return `${path}?${new URLSearchParams({ next: workspaceReturnTo(destination) })}`;
}
