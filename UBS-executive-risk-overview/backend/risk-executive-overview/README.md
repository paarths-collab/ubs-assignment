# Executive Risk Overview Backend

Component 1 of a UBS-style synthetic risk-insights proof of concept. This backend calculates all verified facts deterministically from a curated dataset of 1,000 risk events; a Groq LLM (model `openai/gpt-oss-120b`) only explains those facts and never calculates, estimates, or invents numbers, Event IDs, or other factual values.

## Setup

1. **Install dependencies** from the repo root:
   ```bash
   npm install
   ```

2. **Configure environment** (optional for most endpoints):
   ```bash
   cp backend/risk-executive-overview/.env.example backend/risk-executive-overview/.env
   ```
   
   Every endpoint except the AI assistant works without configuration. To enable the Manager AI Assistant, add your Groq API key:
   - Get a key from [Groq Console](https://console.groq.com)
   - Set `GROQ_API_KEY` in `.env`

## Running

- **Development server**: `npm run dev:api` (from repo root)  
  Starts on the configured port (default 4000).

- **Type check**: `npm run typecheck`

- **Run all tests**: `npm test` (runs Vitest across all workspaces, including this backend)

- **Smoke test for AI** (requires real `GROQ_API_KEY`):
  ```bash
  npm run smoke:ai --workspace=backend/risk-executive-overview
  ```
  Never run this in CI — it calls the real Groq API.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check, dataset status, AI availability |
| GET | `/api/metadata` | Filter options (organisations, dates, types, severity levels, etc.) |
| POST | `/api/overview` | KPIs and distributions for filtered event population |
| POST | `/api/priority-signals` | Ranked patterns (issues/recurrence) above a threshold |
| POST | `/api/risk-detail` | Deep dive into a pattern, KPI, period, or event set |
| POST | `/api/ai/manager-insight` | LLM-generated narrative explanation of a selection |
| POST | `/api/actions` | Log an action (investigation, review, escalation) |

Each endpoint is called via JSON request body (except `/api/health` and `/api/metadata` which are GET). Every response includes an `X-Request-Id` header for request correlation.

## Data

Four JSON files under `data/` form the source of truth, validated at startup:

- `risk_events_overview.json` — 1,000 risk events with occurrence date, severity, financial amounts, owner, assignee, remediation hours, and narrative detail
- `risk_patterns_overview.json` — Grouped patterns (issues, owner recurrence, assignee concentration, cross-organisation concerns) with patternIds and eventId membership
- `risk_config_overview.json` — Filter definitions, business rules (open-backlog status exclusions, financial-KPI applicability), and KPI metadata
- `risk_ai_config_overview.json` — LLM system prompt and configuration (for future multi-model support)

## Design Notes

**Shared FilterService.** Every endpoint normalizes filters using the same function, ensuring consistent interpretation across the API and guaranteeing that `/api/overview` and `/api/priority-signals` operate on the same population.

**Financial KPI Applicability.** Non-Financial event type filters set `grossExposure`, `netExposure`, and `recoveryRate` to `{value: null, applicable: false}` rather than fabricated zeros. Clients see why these KPIs are unavailable.

**People as Workflow Concentration.** When a person (owner, assignee) appears across multiple events, this indicates workflow concentration, not personal blame. The system and LLM never frame recurrence as performance failure or misconduct.

**AI Graceful Degradation.** When Groq is unavailable or returns invalid output, the route catches the error and returns HTTP 200 with `{available: false, reason: "..."}` rather than a 5xx error. Factual endpoints (`/api/overview`, `/api/risk-detail`, etc.) never fail just because the AI failed. The AI service validates all responses against Zod schemas and an Evidence subset check before returning them to the client.

**Dataset Validation.** Startup validation runs `validateDataset()` on load, checking event count, ID uniqueness, required fields, valid enum values, ISO date format, pattern references, and config completeness. A bad dataset fails fast, before any request is served.

**Deterministic Calculations.** KPI values, distributions, and pattern ranking are fully deterministic — the same request always produces the same response, enabling cache-friendliness and predictable debugging.
