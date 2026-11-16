/**
 * Draws the legend swatch as the actual node shape rather than a generic
 * colour chip. The graph encodes type by shape first, so a legend that only
 * shows colour leaves the encoding undocumented.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

/** Polygon/circle geometry for each vis-network shape, on a 0..20 viewBox. */
const GEOMETRY: Record<string, { tag: "polygon" | "circle"; points?: string; r?: number }> = {
  diamond: { tag: "polygon", points: "10,1 19,10 10,19 1,10" },
  dot: { tag: "circle", r: 8 },
  square: { tag: "polygon", points: "3,3 17,3 17,17 3,17" },
  triangle: { tag: "polygon", points: "10,2 18,18 2,18" },
  triangleDown: { tag: "polygon", points: "2,3 18,3 10,19" },
  hexagon: { tag: "polygon", points: "10,1 18,5.5 18,14.5 10,19 2,14.5 2,5.5" },
  star: { tag: "polygon", points: "10,1 12.4,7.3 19,7.6 13.8,11.8 15.6,18.4 10,14.6 4.4,18.4 6.2,11.8 1,7.6 7.6,7.3" },
};

export function legendGlyph(shape: string, fill: string, stroke: string, scale = 1): SVGSVGElement {
  const size = 14;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("legend-glyph");

  const geometry = GEOMETRY[shape] ?? GEOMETRY.dot!;
  const node = document.createElementNS(SVG_NS, geometry.tag);

  if (geometry.tag === "circle") {
    node.setAttribute("cx", "10");
    node.setAttribute("cy", "10");
    node.setAttribute("r", String((geometry.r ?? 8) * scale));
  } else {
    node.setAttribute("points", geometry.points ?? "");
    if (scale !== 1) node.setAttribute("transform", `translate(10 10) scale(${scale}) translate(-10 -10)`);
  }

  node.setAttribute("fill", fill);
  node.setAttribute("stroke", stroke);
  node.setAttribute("stroke-width", "1.5");
  svg.appendChild(node);
  return svg;
}
