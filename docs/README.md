# Documentation index

Architecture and reference docs for the Risk Stream Explorer. Start with
[Architecture](architecture.md) for the system shape, or jump straight to the
[page guides](pages/README.md) if you want to know what a specific screen does.

## System

| Doc | Covers |
| --- | --- |
| [Architecture](architecture.md) | System diagram, the two data-delivery strategies |
| [Repository layout](repository-layout.md) | Annotated tree of both workspaces |
| [Data model](data-model.md) | The 5 canonical datasets, enterprise baseline, the 8-node / 12-relation graph model |
| [AI grounding](ai-grounding.md) | How the LLM is constrained: evidence packages, double validation, hallucination rejection, fallbacks, provider abstraction, prompt contract |

## The pages

| Doc | Route |
| --- | --- |
| [Overview & routing](pages/README.md) | — |
| [Landing](pages/landing.md) | `/` |
| [Risk Stream / Streamgraph](pages/streamgraph.md) | `/streamgraph` |
| [Relationship Network](pages/relationship-network.md) | `/graph` |
| [Executive Risk Overview](pages/issues.md) | `/issues` |
| [Pattern Intelligence](pages/patterns.md) | `/patterns` |

## Implementation

| Doc | Covers |
| --- | --- |
| [HTTP API](api.md) | All 15 routes, response envelopes, error codes, middleware stack |
| [Frontend](frontend.md) | Boot sequence, state, styling layers, single-file build |
| [Backend](backend.md) | Layering, composition root, startup caching, fault isolation |

## Operations

| Doc | Covers |
| --- | --- |
| [Development](development.md) | Run modes, environment variables, all scripts |
| [Testing](testing.md) | The four test layers, what each covers |
| [Deployment](deployment.md) | Vercel + Render topology (full walkthrough in [DEPLOY.md](../DEPLOY.md)) |
| [Design decisions](design-decisions.md) | Why it is built this way, and the explicit non-goals |

---

[Project README](../README.md)
