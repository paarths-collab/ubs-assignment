# The data layer

Five canonical JSON files. Nothing is computed at build time from anywhere
else, and nothing in the UI invents numbers.

```mermaid
erDiagram
    ENTERPRISE ||--o{ ORGANISATION : contains
    ORGANISATION ||--o{ RISK_EVENT : owns
    PERSON ||--o{ RISK_EVENT : "owns / assigned / created / modified"
    RISK_EVENT }o--|| ISSUE : "has issue"
    RISK_EVENT }o--|| ROOT_CAUSE : "has root cause"
    RISK_EVENT }o--|| RISK_THEME : "has risk theme"
    RISK_EVENT }o--|| OR_CATEGORY : "has OR category"
    PATTERN }o--o{ RISK_EVENT : "matching_event_ids"

    RISK_EVENT {
        string event_id "SIM-0000123"
        string severity "Low|Moderate|High"
        string status
        date occurrence_date
        date detection_date
        date record_date
        number gross_amount_usd
        number recovery_amount_usd
        number net_amount_usd
        number potential_impact_amount_usd
    }
    PATTERN {
        string pattern_id
        string priority_level
        object observed
        object compared_with_enterprise
        object graph_filter
        array matching_event_ids
    }
```

## The five files

| File | Shape | Powers |
| --- | --- | --- |
| `events_streamgraph.json` | 1,000 narrative events | Streamgraph timeline |
| `event_details_streamgraph.json` | detail record per `SIM-…` id | Event drawer |
| `event_ai_streamgraph.json` | pre-generated period / event / trend insight text | Streamgraph insight fallbacks |
| `risk_events_final.json` | `{ definitions, enterprise, events[1000] }` | Issues page, patterns, all issue signals |
| `risk_patterns_final.json` | `{ enterprise, priority_queue[22], patterns[137] }` | Pattern Intelligence |
| `*_brain.json` (frontend `src/graph/data/`) | 1,136 nodes · 11,024 edges · 1,000 events · pre-built indexes | Relationship Network **and** the server-side relationship AI |

## Enterprise baseline (the comparison anchor)

Everything comparative in the app is measured against these figures, read
straight off `risk_events_final.json`:

| Metric | Baseline |
| --- | --- |
| Events | 1,000 (Low 705 · Moderate 244 · High 51) |
| High rate | 5.1% |
| Open rate | 72.1% (721 open) |
| Detection delay | mean 2.46 d · median 1 d |
| Recording delay | mean 3.61 d · median 3 d |
| Occurrence → record | mean 6.07 d · median 5 d |

## Graph model

- **8 node types** — `enterprise`, `organisation`, `person`, `event`, `issue`,
  `root_cause`, `risk_theme`, `or_category`
- **12 relation types** — `ORG_OWNS_EVENT`, `ORG_DISCOVERED_EVENT`,
  `PERSON_OWNS_EVENT`, `PERSON_ASSIGNED_EVENT`, `PERSON_ADMINISTERS_EVENT`,
  `PERSON_CREATED_EVENT`, `PERSON_MODIFIED_EVENT`, `EVENT_HAS_ISSUE`,
  `EVENT_HAS_ROOT_CAUSE`, `EVENT_HAS_RISK_THEME`, `EVENT_HAS_OR_CATEGORY`,
  `ENTERPRISE_CONTAINS_ORGANISATION`
- `indexes_brain.json` ships **pre-computed adjacency** (`node_to_events`,
  `node_to_edges`, `node_to_neighbors`, `nodes_by_type`, `edges_by_relation`,
  `search`) so no traversal is built at page load.

---

[← Docs index](README.md) · [Project README](../README.md)
