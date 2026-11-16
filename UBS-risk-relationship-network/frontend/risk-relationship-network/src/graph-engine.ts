import { DataSet, Network } from "vis-network/standalone/esm/vis-network.js";
import type { GraphData, VisEdgeInput, VisNodeInput } from "./graph-types";

const FONT = {
  size: 12,
  face: "-apple-system, BlinkMacSystemFont, Segoe UI, Inter, sans-serif",
  strokeWidth: 4,
  strokeColor: "#000000",
};

/**
 * The relationship model is a chain (Enterprise -> Organisation -> Issue ->
 * Root Cause -> Risk Theme -> OR Category), so a layered left-to-right
 * layout reads far better than a force-directed blob: each hop occupies its
 * own column and the direction of the relationship is visible at a glance.
 */
const HIERARCHICAL_LAYOUT = {
  enabled: true,
  direction: "LR",
  sortMethod: "directed",
  levelSeparation: 300,
  nodeSpacing: 42,
  treeSpacing: 60,
  blockShifting: true,
  edgeMinimization: true,
  parentCentralization: true,
  shakeTowards: "roots",
} as const;

const NETWORK_OPTIONS = {
  autoResize: true,
  interaction: { hover: true, tooltipDelay: 150, navigationButtons: false, dragNodes: true },
  layout: { hierarchical: HIERARCHICAL_LAYOUT, improvedLayout: true },
  // The hierarchical layout places nodes deterministically, so the physics
  // simulation only adds jitter and a settling delay. Off by default;
  // the toolbar toggle turns it on for free-form exploration.
  physics: {
    enabled: false,
    solver: "hierarchicalRepulsion",
    hierarchicalRepulsion: { nodeDistance: 140, springLength: 220, springConstant: 0.01, damping: 0.35 },
    stabilization: { iterations: 250 },
    minVelocity: 0.75,
  },
  nodes: {
    borderWidth: 2,
    font: FONT,
    // The overview is wide, so it is often viewed zoomed out; keep labels
    // drawn rather than letting vis-network hide them below its default
    // size threshold.
    scaling: { label: { enabled: false, drawThreshold: 1 } },
  },
  edges: {
    smooth: { enabled: true, type: "cubicBezier", forceDirection: "horizontal", roundness: 0.5 },
    selectionWidth: 2,
    arrows: { to: { scaleFactor: 0.5 } },
  },
};

/**
 * Owns a single vis.Network instance for the lifetime of the app. The
 * Network object itself is never destroyed/recreated on filter or
 * expansion changes — only its two DataSets are updated in place, keyed by
 * ID, so repeated exploration cannot duplicate nodes/edges or corrupt state.
 */
export class GraphEngine {
  private network: Network | null = null;
  private readonly nodesDataSet = new DataSet<VisNodeInput>([]);
  private readonly edgesDataSet = new DataSet<VisEdgeInput>([]);
  private physicsEnabled = false;
  /** Set when the graph content changed and the view should reframe once settled. */
  private pendingFit = true;
  private fitTimer: ReturnType<typeof setTimeout> | undefined;

  mount(container: HTMLElement): void {
    if (this.network) return;
    this.network = new Network(container, { nodes: this.nodesDataSet, edges: this.edgesDataSet }, NETWORK_OPTIONS);
    // Hierarchical layout settles well after construction, so the initial
    // fit has to wait for it — fitting earlier frames the empty canvas.
    this.network.on("stabilizationIterationsDone", () => {
      this.setPhysicsEnabled(false);
      if (this.pendingFit) {
        this.pendingFit = false;
        this.network?.fit();
        this.network?.redraw();
      }
    });

    // The container is sized by CSS grid after this constructor runs, and
    // vis-network's own autoResize does not reliably catch that first
    // layout pass. Re-measuring on every real size change is the robust
    // fix rather than guessing at a timeout.
    const resizeObserver = new ResizeObserver(() => {
      this.network?.redraw();
    });
    resizeObserver.observe(container);
  }

  /** Replaces the full visible graph, diffing by ID so unrelated nodes never flicker. */
  setGraph(graph: GraphData): void {
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
    this.pendingFit = true;
    // vis-network does not reliably repaint on its own immediately after a
    // same-tick DataSet population inside a CSS grid layout; force a frame.
    this.network?.redraw();

    // Reframe once the layout has been applied. A timer rather than the
    // stabilization event, because with physics disabled that event never
    // fires — and the layout is ready almost immediately anyway.
    clearTimeout(this.fitTimer);
    this.fitTimer = setTimeout(() => {
      if (!this.pendingFit) return;
      this.pendingFit = false;
      this.network?.fit();
      this.network?.redraw();
    }, 250);
  }

  focusNode(nodeId: string): void {
    if (!this.network || !this.nodesDataSet.get(nodeId)) return;
    this.network.selectNodes([nodeId]);
    this.network.focus(nodeId, { scale: 1.1, animation: { duration: 400, easingFunction: "easeInOutQuad" } });
    this.network.redraw();
  }

  fit(): void {
    this.network?.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
    this.network?.redraw();
  }

  setPhysicsEnabled(enabled: boolean): void {
    this.physicsEnabled = enabled;
    this.network?.setOptions({ physics: { enabled } });
  }

  isPhysicsEnabled(): boolean {
    return this.physicsEnabled;
  }

  onSelectNode(handler: (nodeId: string) => void): void {
    this.network?.on("selectNode", (params: { nodes: string[] }) => {
      const nodeId = params.nodes[0];
      if (nodeId) handler(nodeId);
    });
  }

  onDoubleClickNode(handler: (nodeId: string) => void): void {
    this.network?.on("doubleClick", (params: { nodes: string[] }) => {
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
