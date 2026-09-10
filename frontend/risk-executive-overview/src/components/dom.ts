type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") {
      node.className = String(value);
    } else if (key === "html") {
      node.innerHTML = String(value);
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key.startsWith("aria-") || key.startsWith("data-") || key === "role" || key === "tabindex") {
      node.setAttribute(key, String(value));
    } else {
      (node as unknown as Record<string, unknown>)[key] = value;
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: Element): void {
  node.innerHTML = "";
}

export function mount(container: Element, ...children: Child[]): void {
  clear(container);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    container.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
}
