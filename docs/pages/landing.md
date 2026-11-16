# Signal workspace (`/`)

**Purpose.** A neutral entry point to Signal — Data Analysis. It introduces
the synthetic dataset, shows computed summary figures, and opens the analytics,
timeline, relationships, issues, and pattern investigation screens.

- Renders from the already-loaded streamgraph `EventRepository` — no fetch, no
  spinner.
- Headline counts (total events, organisations, High-severity) computed live.
- Files: [`LandingPage.ts`](../../frontend/risk-stream-explorer/src/components/LandingPage.ts),
  [`landing.css`](../../frontend/risk-stream-explorer/src/styles/landing.css).

---

[← Docs index](../README.md) · [← All pages](README.md) · [Project README](../../README.md)
