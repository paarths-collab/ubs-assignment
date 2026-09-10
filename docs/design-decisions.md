# Design decisions & non-goals

| Decision | Rationale |
| --- | --- |
| Deterministic computation, AI interpretation | Numbers must be auditable and reproducible. A model that counts is a model that can be wrong about a fact. |
| Hallucinated-event-id rejection | The cheapest, sharpest tripwire for fabricated evidence — an id is either in the allowed set or it isn't. |
| `whatWouldDisproveThis` as a required field | Forces the model to argue against itself; a finding with no falsifier isn't a finding. |
| Signals with published thresholds and weights, not a composite score | An analyst can disagree with a threshold. Nobody can disagree with a black box. |
| Flat dataset dimensions excluded from ranking | Ranking on a constant fabricates a distinction that isn't in the data. |
| Trends anchored to the last complete data month | Wall-clock anchoring would invent a decline out of a partial final period. |
| Pinned model slugs | A graded build must not change behaviour between authoring and review. |
| Vanilla TS, no UI framework | The heavy surfaces are imperative drawing; a framework would add weight without leverage. |
| Single-file bundle | Runs from `file://`, one artefact to hand over. |
| In-memory `Map` cache | One Node process. Redis would be architecture theatre. |

**Explicit non-goals:** authentication, a database, multi-tenancy, write
operations of any kind, real-time streaming, and horizontal scale. This is a
read-only analytical workbench over a fixed synthetic dataset, and every
component is built to that scope.

---

[← Docs index](README.md) · [Project README](../README.md)
