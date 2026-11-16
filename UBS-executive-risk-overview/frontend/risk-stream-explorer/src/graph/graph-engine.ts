import { DataSet, Network } from "vis-network/standalone/esm/vis-network.js";
import type { GraphData, VisEdgeInput, VisNodeInput } from "./graph-types";

const FONT = {
  size: 11,
  color: "#c8ccd4",
  face: "-apple-system, BlinkMacSystemFont, Segoe UI, Inter, sans-serif",
  // A dark halo keeps labels legible where they cross edges or other nodes.
  strokeWidth: 3,
  strokeColor: "#000000",
};

const NETWORK_OPTIONS = {
  autoResize: true,
  interaction: { hover: true, tooltipDelay: 150, navigationButtons: false, dragNodes: true },
  // The flow is a strict left-to-right tree: every node carries an explicit
  // `level` set by flow-builder, so vis-network places columns
  // deterministically rather than inferring structure from edge direction.
  // No random layout, and nothing here re-arranges once selection changes
  // levels — repeated exploration always produces the same shape.
  layout: {
    hierarchical: {
      enabled: true,
      direction: "LR",
      sortMethod: "directed",
      levelSeparation: 230,
      nodeSpacing: 90,
      treeSpacing: 40,
      blockShifting: true,
      edgeMinimization: true,
    },
  },
  // Physics here only resolves sibling spacing *within* a fixed column —
  // it never moves a node between levels. It freezes itself once settled
  // (see stabilizationIterationsDone below), so the graph does not drift.
  physics: {
    enabled: true,
    solver: "hierarchicalRepulsion",
    hierarchicalRepulsion: { nodeDistance: 90, springLength: 100, springConstant: 0.02, damping: 0.4 },
    stabilization: { enabled: true, iterations: 200, updateInterval: 25 },
    minVelocity: 0.9,
  },
  nodes: {
    borderWidth: 1.5,
    font: FONT,
    scaling: { label: { enabled: false, drawThreshold: 1 } },
  },
  edges: {
    smooth: { enabled: true, type: "cubicBezier", forceDirection: "horizontal", roundness: 0.55 },
    selectionWidth: 2,
    arrows: { to: { enabled: true, scaleFactor: 0.55 } },
  },
};

/**
 * Owns a single vis.Network instance for the lifetime of the app. The
 * Network object itself is never destroyed/recreated on filter or
 * selection changes — only its two DataSets are updated in place, keyed by
 * ID, so repeated exploration cannot duplicate nodes/edges or corrupt state.
 */
export class GraphEngine {
  private network: Network | null = null;
  private readonly nodesDataSet = new DataSet<VisNodeInput>([]);
  private readonly edgesDataSet = new DataSet<VisEdgeInput>([]);
  /** Set when the graph content changed and the view should reframe once settled. */
  private pendingFit = true;
  private fitTimer: ReturnType<typeof setTimeout> | undefined;

  mount(container: HTMLElement): void {
    if (this.network) return;
    this.network = new Network(container, { nodes: this.nodesDataSet, edges: this.edgesDataSet }, NETWORK_OPTIONS);

    this.network.on("stabilizationIterationsDone", () => {
      this.network?.setOptions({ physics: { enabled: false } });
      if (this.pendingFit) {
        this.pendingFit = false;
        this.network?.fit();
        this.network?.redraw();
      }
    });

    // The container is sized by CSS grid after this constructor runs, and
    // vis-network's own autoResize does not reliably catch that first
    // layout pass — a network built against a zero-size container keeps a
    // zero-size canvas forever unless it is explicitly re-measured. So on
    // every real size change, force the re-measure and reframe.
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!this.network || !entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;

      this.network.setSize("100%", "100%");
      this.network.redraw();
      if (this.pendingFit) {
        this.pendingFit = false;
        this.network.fit();
      }
    });
    resizeObserver.observe(container);
  }

  /**
   * Replaces the full visible graph, diffing by ID so unrelated nodes never
   * flicker.
   *
   * @param options.fit Whether to reframe the camera once the new layout
   *   settles. Defaults to true for an actual navigation (a new root, a new
   *   view mode) where snapping to the new shape is what the analyst wants.
   *   Pass `false` for a same-root filter tweak — narrowing/widening the
   *   current investigation shouldn't reset whatever pan/zoom the analyst
   *   already set up; re-fitting on every checkbox click reads as the whole
   *   graph "refreshing" out from under them.
   */
  setGraph(graph: GraphData, options: { fit?: boolean } = {}): void {
    const shouldFit = options.fit ?? true;
    const nextNodeIds = new Set(graph.nodes.map((node) => node.id));
    const nextEdgeIds = new Set(graph.edges.map((edge) => edge.id));

    for (const existing of this.nodesDataSet.get()) {
      if (!nextNodeIds.has(existing.id)) this.nodesDataSet.remove(existing.id);
    }
    for (const existing of this.edgesDataSet.get()) {
      if (!nextEdgeIds.has(existing.id)) this.edgesDataSet.remove(existing.id);
    }

    this.nodesDataSet.update(graph.nodes);
    this.edgesDataSet.update(graph.edges);
    this.pendingFit = shouldFit;
    // A new tree needs its columns re-settled, so re-arm physics briefly —
    // it freezes itself again once stable (see stabilizationIterationsDone).
    // This still runs even when `fit` is false: sibling spacing within a
    // column needs to resolve when the node set changes, that's just a much
    // smaller visual change than the camera jumping.
    this.network?.setOptions({ physics: { enabled: true } });
    // vis-network does not reliably repaint on its own immediately after a
    // same-tick DataSet population inside a CSS grid layout; force a frame.
    this.network?.redraw();

    clearTimeout(this.fitTimer);
    if (!shouldFit) return;

    // Reframe once the layout has been applied. A timer as a fallback in
    // case stabilization finishes before this call returns or never fires
    // (e.g. an empty graph).
    this.fitTimer = setTimeout(() => {
      if (!this.pendingFit) return;
      this.pendingFit = false;
      this.network?.fit();
      this.network?.redraw();
    }, 400);
  }

  focusNode(nodeId: string): void {
    if (!this.network || !this.nodesDataSet.get(nodeId)) return;
    this.network.selectNodes([nodeId]);
    this.network.focus(nodeId, { scale: 1.0, animation: { duration: 400, easingFunction: "easeInOutQuad" } });
    this.network.redraw();
  }

  fit(): void {
    this.network?.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
    this.network?.redraw();
  }

  onSelectNode(handler: (nodeId: string) => void): void {
    this.network?.on("selectNode", (params: { nodes: string[] }) => {
      const nodeId = params.nodes[0];
      if (nodeId) handler(nodeId);
    });
  }

  hasNode(nodeId: string): boolean {
    return this.nodesDataSet.get(nodeId) !== null;
  }

  getNodeCount(): number {
    return this.nodesDataSet.length;
  }

  getEdgeCount(): number {
    return this.edgesDataSet.length;
  }

  destroy(): void {
    this.network?.destroy();
    this.network = null;
  }
}
