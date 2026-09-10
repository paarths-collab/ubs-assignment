# Local development

## Prerequisites

- Node.js 18+ (ESM, native `fetch`)
- npm 9+ (workspaces)

## Install

```bash
npm install
```

## Components 1–3 only (pure static frontend)

```bash
npm run dev
```

## Full app, including all AI panels

```bash
cp backend/risk-stream-explorer/.env.example backend/risk-stream-explorer/.env
# set OPENROUTER_API_KEY in that file (optional — without it every
# deterministic panel still works and AI panels show a fallback)
```

```bash
npm run dev:server   # terminal 1 — API on :3001
```

```bash
npm run dev          # terminal 2 — frontend on :5173
```

## Single-command, single-origin mode

```bash
npm run build && npm run dev:server
```

Then open `http://localhost:3001` — the API serves the built bundle, so there
is no CORS to configure.

## Environment variables

**Backend** (`backend/risk-stream-explorer/.env`)

| Var | Default | Meaning |
| --- | --- | --- |
| `LLM_PROVIDER` | `openrouter` | `openrouter` · `groq` · `openai` |
| `OPENROUTER_API_KEY` | — | provider key (or `GROQ_API_KEY` / `OPENAI_API_KEY`) |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | — | explicit overrides; win over provider defaults |
| `PORT` | `3001` | |
| `CORS_ORIGIN` | localhost dev ports + `null` | comma-separated allowlist; `null` covers `file://` pages |
| `AI_TIMEOUT_MS` | `15000` | per provider call |
| `AI_CACHE_TTL_MS` | `3600000` | 1 hour |

**Frontend** (`frontend/risk-stream-explorer/.env`)

| Var | Default | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3001` | build-time public value, inlined into the bundle |

## All scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server (frontend) |
| `npm run dev:server` | Fastify via `tsx` (no compile step) |
| `npm run build` | single-file bundle → `dist/risk-stream-explorer.html` |
| `npm run typecheck` | `tsc` over both workspaces |
| `npm test` | full Vitest suite |
| `npm run test:watch` | Vitest watch mode |
| `npm run validate-data` | re-run dataset schema validation standalone |

---

[← Docs index](README.md) · [Project README](../README.md)
