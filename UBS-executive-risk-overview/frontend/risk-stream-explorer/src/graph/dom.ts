/**
 * Tiny DOM helpers. Everything user-visible is built with textContent
 * rather than innerHTML: the dataset carries free-text narratives, and
 * later the AI response carries model-generated prose — neither is ever
 * interpolated into markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string; attrs?: Record<string, string> } = {},
  children: (Node | null)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  for (const child of children) {
    if (child) node.appendChild(child);
  }
  return node;
}

/** A label/value row used throughout the inspector. */
export function statRow(label: string, value: string): HTMLElement {
  return el("div", { className: "stat-row" }, [
    el("span", { className: "stat-label", text: label }),
    el("span", { className: "stat-value", text: value }),
  ]);
}

export function sectionHeading(text: string): HTMLElement {
  return el("h3", { className: "inspector-section", text });
}
