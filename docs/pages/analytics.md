# Analytics dashboard (`/kpi`)

The executive analytics screen in Signal — Data Analysis turns a selected
population of synthetic operational events into metrics, priorities, and
traceable evidence.

- Filter by organisation, financial/non-financial event type, severity, and
  occurrence-date range.
- Review eight headline KPIs: events, High severity, open backlog, gross
  exposure, net exposure, recovery rate, potential impact, and remediation
  effort. Select a KPI to inspect its contributing event evidence.
- Compare urgency, exposure, recurrence, and emerging signals in the attention
  cards, then inspect a selected issue's risk brief.
- Explore severity and workflow composition, financial and operational impact,
  organisation concentration, and recurring issues.
- Request portfolio analysis, a deeper issue review, an investigation plan,
  enterprise comparison, or a contextual follow-up answer.

All quantitative metrics come from the executive backend's verified dataset.
AI interpretation is optional; provider errors do not remove the analytical
panels. Figures that do not apply to a selected population remain marked
“Not applicable” rather than being presented as zero.

**Implementation:** `frontend/risk-executive-overview` and
`backend/risk-executive-overview`. The same-origin API gateway routes these
requests alongside the exploration API.

---

[← All screens](README.md) · [← Docs index](../README.md)
