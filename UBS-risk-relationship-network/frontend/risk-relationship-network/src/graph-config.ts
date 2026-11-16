/** Hard ceiling on rendered nodes — beyond this the graph stops being readable. */
export const MAX_VISIBLE_NODES = 300;

/** Cap on Event nodes injected by a single expansion action. */
export const MAX_EVENT_NODES_PER_EXPANSION = 100;

/** Debounce for filter/search recomputation, in milliseconds. */
export const FILTER_DEBOUNCE_MS = 150;
