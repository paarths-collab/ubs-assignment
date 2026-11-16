# Architecture at a glance

An npm-workspaces monorepo with two packages. The backend is *both* a
TypeScript library (imported directly by the frontend build via the `@backend`
alias) **and** a Fastify HTTP server.

```mermaid
graph TB
    subgraph Browser
      R[router.ts<br/>path + hash routing]
      L[LandingPage]
      SG[StreamGraph page]
      GR[Graph page]
      IS[Issues page]
      PT[Patterns page]
      R --> L & SG & GR & IS & PT
    end

    subgraph "Build-time import (@backend alias)"
      LIB[Backend as a library:<br/>loadDataset, EventRepository,<br/>FilterService, MetricService…]
    end

    subgraph "Fastify API :3001"
      RT[Routes]
      SVC[Services]
      REPO[Repositories]
      RT --> SVC --> REPO
    end

    subgraph Data
      DS[(events_streamgraph<br/>event_details<br/>event_ai)]
      DR[(risk_events_final<br/>risk_patterns_final)]
      DG[(nodes/edges/events/<br/>indexes _brain)]
    end

    SG -.build-time.-> LIB --> DS
    GR -.bundled.-> DG
    IS -->|fetch| RT
    PT -->|fetch| RT
    SG -->|fetch AI only| RT
    GR -->|fetch AI only| RT
    REPO --> DR
    REPO --> DS
    SVC --> DG
    SVC --> P[(LLM provider<br/>OpenRouter / Groq / OpenAI)]
```

**Two data-delivery strategies, on purpose:**

| Strategy | Used by | Why |
| --- | --- | --- |
| **Build-time embedding** (JSON imported into the bundle) | Streamgraph, Relationship Network | These are visual explorers over a fixed dataset. Embedding makes them work from a single static HTML file — even `file://` — with zero API dependency. |
| **Runtime HTTP fetch** | Executive Overview, Pattern Intelligence | Their content is *derived* (ranking, signals, comparisons) and computed once at server startup. Serving it keeps ranking logic and thresholds server-side and out of the client bundle. |

Repository layout: [repository-layout.md](repository-layout.md).

---

[← Docs index](README.md) · [Project README](../README.md)
