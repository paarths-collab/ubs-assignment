# Backend architecture

Strict layering — routes never touch data, services never touch HTTP.

```mermaid
flowchart TB
    subgraph Routes["Routes — HTTP only"]
      H[health] --- P[pattern] --- I[investigation] --- IS[issue] --- E[event] --- A[ai] --- SA[streamgraph-ai] --- RA[relationship-ai]
    end
    subgraph Services["Services — business logic"]
      direction LR
      S1[IssueIntelligence · Investigation]
      S2[Metric · Comparison · Trend · Timeline · Financial · Filter]
      S3[PeriodDetail · EventDetail · SimilarEvent · InsightNarrator]
      S4[Groq · AICache · AIValidation · StreamgraphAi · RelationshipAi]
    end
    subgraph Repositories["Repositories — indexed access"]
      R1[RiskEventRepository] --- R2[PatternRepository] --- R3[EventRepository] --- R4[AIInsightRepository]
    end
    subgraph Loaders
      L1[RiskDataLoader] --- L2[DataLoader]
      V[validateDataset · validateRiskDataset]
    end
    Routes --> Services --> Repositories --> Loaders
    L1 & L2 --> V
    V --> J[(JSON datasets)]
```

**Composition root.** `buildApp(overrides)` builds but does not listen, so
tests `await buildApp({…})` and `.inject(…)` without binding a port, injecting
a fake LLM client and an in-memory dataset. `server.ts` is the thin listen
wrapper.

**Startup work, then O(1) reads.** `IssueIntelligenceService` computes all 15
profiles and the ranking once in its constructor and serves from memory
thereafter — repeated `GET /api/issues*` calls are map lookups.

**Fault isolation.** Both the streamgraph dataset and the relationship graph
dataset are loaded inside `try/catch` at startup. A failure removes only that
route group and logs a warning; the rest of the API boots normally.

**Same-origin single-command mode.** If `dist/` exists, the API serves the
built frontend itself, so the whole app runs on one port with no CORS at all.
The built filename is resolved *per request*, not cached at startup, because a
rebuild while the server is up would otherwise leave it serving a filename
that no longer exists.

---

[← Docs index](README.md) · [Project README](../README.md)
