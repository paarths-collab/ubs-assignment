# The six screens

```mermaid
flowchart TD
    H["/ — Signal workspace<br/>overview + navigation"]
    H --> K["/kpi<br/>Analytics dashboard · metrics + evidence"]
    H --> A["/streamgraph<br/>Risk Stream · time"]
    H --> B["/graph<br/>Relationship Network · structure"]
    H --> C["/issues<br/>Issue Intelligence · ranked issues"]
    H --> D["/patterns<br/>Pattern Intelligence · mined patterns"]
    C -->|related pattern| D
    D -->|graph_filter| B
    A -->|event id| B
    style H fill:#1f6feb,color:#fff
```

## Page guides

| Page | Route | What it answers | Guide |
| --- | --- | --- | --- |
| Workspace | `/` | "Where do I start?" | [landing.md](landing.md) |
| Analytics dashboard | `/kpi` | "What needs attention across this selection?" | [analytics.md](analytics.md) |
| Risk Stream | `/streamgraph` | "How did risk move over time?" | [streamgraph.md](streamgraph.md) |
| Relationship Network | `/graph` | "Who and what is connected?" | [relationship-network.md](relationship-network.md) |
| Issue Intelligence | `/issues` | "Which issues deserve attention, and why?" | [issues.md](issues.md) |
| Pattern Intelligence | `/patterns` | "Which mined patterns are worth investigating?" | [patterns.md](patterns.md) |

## Routing

Routing supports **both** `/streamgraph` (http/https, needs SPA rewrite) and
`#/streamgraph` (for the single-file build opened from `file://`) — see
`router.ts`. The `/kpi` dashboard is a separate Vite application served
through the same local gateway or deployment. It requires an HTTP server.

---

[← Docs index](../README.md) · [← All pages](README.md) · [Project README](../../README.md)
