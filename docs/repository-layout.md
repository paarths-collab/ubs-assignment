# Repository layout

```
UBS/
├── package.json              npm workspaces root, all dev scripts
├── vitest.config.ts          one test runner across both workspaces
├── tsconfig.base.json        shared compiler options
├── vercel.json               frontend deploy (SPA rewrite)
├── render.yaml               backend deploy blueprint
├── DEPLOY.md                 step-by-step deployment guide
│
├── backend/risk-stream-explorer/
│   ├── data/                 5 canonical JSON datasets
│   ├── scripts/validate-data.ts
│   ├── src/
│   │   ├── app.ts            buildApp() — plugin + route composition root
│   │   ├── server.ts         listen wrapper
│   │   ├── index.ts          library entry (what the frontend imports)
│   │   ├── config/           env, llm, constants, thresholds, playbooks
│   │   ├── repositories/     dataset loading + indexed lookups
│   │   ├── services/         all business logic (23 services)
│   │   ├── routes/           8 route modules
│   │   ├── prompts/          3 versioned prompt builders
│   │   ├── validation/       dataset schema validation
│   │   ├── middleware/       error handler / 404 handler
│   │   ├── types/            10 domain type modules
│   │   └── utils/            date, format, risk math, slug
│   └── tests/                26 test files
│
└── frontend/risk-stream-explorer/
    ├── vite.config.ts        single-file bundle, @backend alias
    ├── index.html
    └── src/
        ├── main.ts           boot + route dispatch + streamgraph page shell
        ├── router.ts         path/hash dual routing
        ├── components/       Components 2 & 4 UI (23 modules)
        ├── graph/            Component 3 — self-contained network explorer
        ├── services/         LLMClient, PatternApiClient
        ├── state/            Store, AppState, AppContext
        ├── styles/           tokens + layered CSS
        └── types/            client-side view types
```

---

[← Docs index](README.md) · [Project README](../README.md)
