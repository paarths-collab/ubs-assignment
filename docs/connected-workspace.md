# Connected Back Office workspace

The supplied frontend ZIP is preserved in two folders: `frontend/back-office` contains the complete application; `frontend/back-office-preview` contains the standalone public reference. The homepage retains its illustrations, animation controls, interactive sales demo, fonts, and reference styling. Its sales demo is explicitly synthetic and calculated locally.

The complete application's home links open `/workspace/overview`, `/workspace/datasets`, `/workspace/analyze`, and `/workspace/dashboards`. These pages use the existing operational backend. Event counts, filters, exposure, source records, and chart values come from the canonical synthetic event dataset. Financial loss is labelled as exposure, never sales revenue. AI analysis uses the existing guarded streaming routes and is disabled when the provider is unavailable.

## Local startup

Install the root dependencies, then `npm --prefix frontend/back-office ci --ignore-scripts --workspaces=false`.
Run `npm run start:connected` to build both frontends and start the connected app. Open http://127.0.0.1:3000. The legacy frontend backend listens on loopback port 4311; the connected workspace API runs directly inside Next.js and does not depend on that listener. After building, `npm run serve:connected` starts it without rebuilding; set `PORT` to choose another frontend port. Stop with Ctrl-C. Neither command publishes anything.

The workspace's `/api/operational/*` Node API forwards requests into the repaired Fastify backend in process. It preserves streaming, cancellation, request limits, and evidence validation. Configure server-only `OPENROUTER_API_KEY`, or `GROQ_API_KEY` with `LLM_PROVIDER=groq`. Shared `LLM_API_KEY` and `LLM_MODEL` are supported when provider-specific values are absent. No key is sent to the browser. Existing deployment variables are used at runtime; see `DEPLOY.md` for the Next project-root settings.

After a production build, `node scripts/check-connected-ai.mjs` starts an isolated standalone server and local fixture provider to verify bundled data, question forwarding, validated streamed answers, and provider-error handling. It does not call a real AI service or validate deployment credentials.

`npm run check:back-office`, `npm --prefix frontend/back-office run lint`, `npm test`, and `npm run validate-data` cover typing, lint, regression tests, and source integrity. Tests that bind HTTP sockets need permission to listen locally.

The original account pages (`/login`, `/register`, `/overview`, `/analyze`, `/datasets`, `/dashboards`) and `/api/v1` proxy remain preserved for the separate Python service expected by the supplied app. Configure server-only `BACKEND_URL` when that service is available. Authentication, file uploads, SQL execution, saved conversations, and saved dashboards are not implemented by the operational backend and are not advertised as connected features. Do not expose this local preview publicly without an access-control review.

The optional public-reference app can be installed separately with the same npm flags, checked with `npm run check:back-office-preview`, and built with `npm run build:back-office-preview`; its static output is in `frontend/back-office-preview/out`.

## Additional operational tools

- `/workspace/investigate`: ranked priority signals, exact event selection, severity and organisation breakdowns, provider-backed deep analysis / investigation plans / enterprise comparisons, and explicitly simulated review actions. Simulations are stored only in process memory and never send notifications.
- `/workspace/issues`: deterministic ranked issues, the priority pattern queue, and their investigation records from the stream-explorer dataset. This library has its own scope; executive dashboard filters are not silently applied to it.
- `/workspace/timeline`: period charts and event drilldown calculated from the canonical executive source, with explicit filters and source IDs.

These pages share DataLens’s existing typography and light/dark tokens. A shared navigation bar covers the homepage, guides, account pages, all workspace pages, and the not-found page, with desktop and mobile menus. Navigation and quick search expose all seven connected destinations. The original detailed frontend remains available locally at `/kpi`.

Component research: reviewed [21st.dev Card Tabs](https://21st.dev/@uiable/components/card-tabs) and its [table collection](https://21st.dev/community/components/s/table). The card source requires an account; the new UI is an original implementation of the tabbed-card/table interaction patterns using existing dependencies and theme tokens. No gated code or new component package was installed.
