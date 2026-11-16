# Landing — Operational Risk Workbench (`/`)

**Purpose.** Orientation, not a dashboard. It explains what the dataset is,
that it is synthetic, that there are two independent timelines, and routes the
reader to the right surface for their question.

- Renders from the already-loaded streamgraph `EventRepository` — no fetch, no
  spinner.
- Headline counts (total events, organisations, High-severity) computed live.
- Files: [`LandingPage.ts`](../../frontend/risk-stream-explorer/src/components/LandingPage.ts),
  [`landing.css`](../../frontend/risk-stream-explorer/src/styles/landing.css).

---

[← Docs index](../README.md) · [← All pages](README.md) · [Project README](../../README.md)
