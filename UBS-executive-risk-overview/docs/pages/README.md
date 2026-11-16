# The five pages

```mermaid
flowchart TD
    H["/ — Landing<br/>orientation + navigation hub"]
    H --> A["/streamgraph<br/>Risk Stream · time"]
    H --> B["/graph<br/>Relationship Network · structure"]
    H --> C["/issues<br/>Executive Overview · ranked issues"]
    H --> D["/patterns<br/>Pattern Intelligence · mined patterns"]
    C -->|related pattern| D
    D -->|graph_filter| B
    A -->|event id| B
    style H fill:#1f6feb,color:#fff
```

## Page guides

| Page | Route | What it answers | Guide |
| --- | --- | --- | --- |
| Landing | `/` | "Where do I start?" | [landing.md](landing.md) |
| Risk Stream | `/streamgraph` | "How did risk move over time?" | [streamgraph.md](streamgraph.md) |
| Relationship Network | `/graph` | "Who and what is connected?" | [relationship-network.md](relationship-network.md) |
| Executive Risk Overview | `/issues` | "Which issues deserve attention, and why?" | [issues.md](issues.md) |
| Pattern Intelligence | `/patterns` | "Which mined patterns are worth investigating?" | [patterns.md](patterns.md) |

## Routing

Routing supports **both** `/streamgraph` (http/https, needs SPA rewrite) and
`#/streamgraph` (for the single-file build opened from `file://`) — see
`router.ts`.

---

[← Docs index](../README.md) · [← All pages](README.md) · [Project README](../../README.md)
