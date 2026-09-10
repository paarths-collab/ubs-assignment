# Risk Stream Explorer

A synthetic, fully simulated UBS-style operational-risk workbench built as an internship take-home. No component in this repo uses real UBS data — every event, pattern, organisation and person is generated data for demonstration purposes.

This is an npm workspaces monorepo:

- `frontend/risk-stream-explorer` — a Vite app, built as a single-file static HTML bundle. Serves the landing page plus Components 2-4.
- `backend/risk-stream-explorer` — a TypeScript library (Components 2/3's data services) **and** a small Fastify HTTP server (Component 4's API).

## Local development

Components 1-3 are a pure static frontend and need only:

```bash
npm run dev
```

**Component 4 (Pattern Intelligence + Investigation Workspace + AI)** additionally needs the backend API server running, since it calls a real HTTP API rather than embedding data at build time. Run both in two terminals:

```bash
# terminal 1 — backend API on :3001
cp backend/risk-stream-explorer/.env.example backend/risk-stream-explorer/.env
# fill in OPENROUTER_API_KEY in that .env (optional — without it, the AI Analyst
# panel gracefully shows a "temporarily unavailable" fallback; every
# deterministic panel still works)
npm run dev:server

# terminal 2 — frontend on :5173
npm run dev
```

Then open the frontend and navigate to **Pattern Intelligence** from the landing page (or go straight to `/patterns`).

The frontend talks to the backend via `VITE_API_BASE_URL` (defaults to `http://localhost:3001`); the backend allows CORS from `CORS_ORIGIN` (defaults to `http://localhost:5173`) — keep these in sync if you change either port.

### Why the AI features need a server at all

All four components call the backend for live AI analysis. The OpenRouter key lives only in the backend's `.env`; it is never sent to the browser or stored in `localStorage`. The backend recomputes the verified facts from the canonical datasets, sends only those facts to the configured model, validates structured responses where applicable, and falls back safely when the provider is unavailable.

The default provider is OpenRouter with `deepseek/deepseek-v4-flash-0731`. Set `OPENROUTER_API_KEY` in `backend/risk-stream-explorer/.env` before starting the server. The model is billed by OpenRouter; it is not an OpenRouter free model.

## Testing & typechecking

```bash
npm run typecheck
npm test
```
