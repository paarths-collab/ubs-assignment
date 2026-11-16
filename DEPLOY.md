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

## DataLens Next workspace (prepared configuration; not deployed)

The connected DataLens application lives in `frontend/back-office`. The root
`vercel.json` still describes the original Vite application and its separate
`api/handler.ts`. Keep that file intact when reviewing the Next migration.
The older Render/static instructions above describe the legacy application,
not the new in-process Next operational API.

For a future authorized switch of the **existing Vercel project**, use these
Build and Deployment settings:

| Setting | Value |
| --- | --- |
| Root Directory | `frontend/back-office` |
| Include source files outside of the Root Directory in the Build Step | Enabled |
| Framework | Next.js |
| Install Command | `npm ci --prefix ../.. && npm ci` |
| Build Command | `npm exec next build -- --webpack` |
| Output Directory | `.next` (Next framework output) |
| Node.js | 22.x or another project-supported version satisfying the app's engine requirement |

The app-specific `frontend/back-office/vercel.json` supplies the framework,
install, build, output and operational function-duration settings. The install
step uses the repository lockfile for the Fastify workspace dependencies and
the nested app lockfile for Next/React. The nested app is currently outside the
root npm workspace list, so both installs are necessary. The build command
intentionally skips the local-only standalone copy/start scripts: Vercel builds
Next functions and assets from `.next`, rather than running `server.js`.
Do not try to turn the root Vite build into a Next deployment merely by pointing
its static output directory at `frontend/back-office/.next`.

Keep the same project identity to retain its domains and configured environment
variables. This preparation does not change the remote project, link a new
project, read secret values, or configure any environment variables. Existing
AI credentials must remain server-only; do not rename them or add a
`NEXT_PUBLIC_` prefix. Confirm that the selected provider's existing key is
available in the intended Preview/Production environment before a later
release. Deterministic data routes do not need an AI credential.

### Backend files and runtime

The `/api/operational/*` Next routes must execute the repaired Fastify backend
inside the Node.js function, with no listener and no localhost dependency. The
legacy `OPERATIONAL_BACKEND_URL` fallback rewrites are local-only and are
disabled on Vercel, including the generic API fallback. On Vercel the known
legacy page paths redirect to native workspace equivalents: `/kpi` to
`/workspace/investigate`, `/issues` and `/patterns` to `/workspace/issues`,
`/streamgraph` to `/workspace/timeline`, and `/graph` to `/workspace/overview`.
A production check must exercise the in-process operational routes with
`OPERATIONAL_BACKEND_URL` unset.

`next.config.ts` widens the output-file tracing root to the repository on Vercel
and explicitly includes only the three operational JSON asset directories for
operational API routes. This is separate from the Vercel outside-root build
access setting: both are needed. Do not broaden tracing to every repository
file, `.env` file, or unrelated asset. The tracing root is the same locally and on Vercel. Local preparation and
startup scripts locate the resulting nested
`.next/standalone/frontend/back-office/server.js`, with compatibility for older
flat standalone builds. The connected runner loads existing repository
`.env.local` and then `.env` before initializing the backend or spawning Next;
explicit process environment values take precedence. No values are logged.

The in-process adapter locates the traced repository assets and passes explicit
data paths into both backend factories. The production standalone smoke test
verifies those paths without a separate backend listener. Configure Node.js
runtime (not Edge). The operational function has a
60-second maximum to accommodate the existing bounded AI requests.

After building, run `node scripts/check-connected-ai.mjs` to exercise the bundled
server with an isolated local fixture provider. This verifies question forwarding,
validated SSE output, and provider rejection handling, without real credentials.
It does not verify an external provider key or Vercel's generated function bundle.

Before any future authorized release, inspect the operational route's
`.nft.json` traces, run a production-build smoke check for health, metadata,
source-events, overview and one configured AI request, and confirm the response
is generated without a separate localhost backend. A local Next build alone
does not verify Vercel function packaging. No deployment has been performed by
adding this configuration.

Official references:

- [Vercel monorepo setup](https://vercel.com/docs/monorepos)
- [Outside-root build access](https://vercel.com/docs/monorepos/monorepo-faq)
- [Root directory and build settings](https://vercel.com/docs/builds/configure-a-build)
- [Next.js output-file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)
