# Deployment

Two services: the **frontend** (static, on Vercel) and the **backend** Fastify
API (on Render). The four pages route client-side; two of them
(Executive Overview, Pattern Intelligence) fetch their content from the API.

| Page | Route | Needs the API? |
| --- | --- | --- |
| Executive Risk Overview | `/issues` | Yes — core content from `/api/issues` |
| Risk Stream / Timeline | `/streamgraph` | No (AI panel only) |
| Relationship Network | `/graph` | No (AI panel only) |
| Pattern Intelligence | `/patterns` | Yes — core content from `/api/patterns/priority` |

Deploy the **backend first** so you have its URL for the frontend build.

## 1. Backend → Render

The repo ships `render.yaml` (a Blueprint). In Render: **New → Blueprint**,
point it at this repo, and it creates the `risk-stream-explorer-api` web
service (`npm install`, `npm start -w backend/risk-stream-explorer`, no compile
step — it runs TypeScript directly via `tsx`).

Set these env vars on the service:

- `CORS_ORIGIN` — your Vercel origin, e.g. `https://your-app.vercel.app`
  (comma-separate multiple; no trailing slash). **Required** or the browser
  blocks the calls.
- `OPENROUTER_API_KEY` (+ optional `LLM_PROVIDER`, `LLM_MODEL`) — only for the
  AI panels. The deterministic routes work without any key.

Health check: `/api/health`. Copy the service URL, e.g.
`https://risk-stream-explorer-api.onrender.com`.

## 2. Frontend → Vercel

The repo ships `vercel.json`: build command
`npm run build --workspace=frontend/risk-stream-explorer`, output `dist/`, and a
SPA rewrite so every non-`/api` path serves `index.html` (needed for direct
loads / refreshes of `/streamgraph`, `/graph`, `/patterns`, `/issues`).

Import the repo in Vercel (root directory = repo root) and set one env var:

- `VITE_API_BASE_URL` — the Render URL from step 1 (no trailing slash).
  It's a build-time public value, inlined into the bundle.

## 3. Close the loop

After the first Vercel deploy, make sure `CORS_ORIGIN` on Render matches the
final Vercel domain, then redeploy the backend if you changed it.

Local dev is unchanged: `npm run dev` (frontend) + `npm run dev:server`
(backend on :3001); an unset `VITE_API_BASE_URL` falls back to
`http://localhost:3001`.
