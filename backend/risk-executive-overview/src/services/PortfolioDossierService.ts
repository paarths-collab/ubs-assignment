import type { RiskEvent } from "../types/RiskEvent";
import type { RiskConfig } from "../types/Config";
import type { NormalizedFilters } from "../schemas/filters.schema";
import type { RiskRepository } from "../repositories/RiskRepository";
import type { KpiSet } from "../types/Kpi";
import type { KpiDeltas } from "./KpiService";
import type { CompositionBlock, ExposureBlock } from "../types/Overview";
import type { AttentionCard } from "./ScenarioService";
import { calculateKPIs, computeKpiDeltas } from "./KpiService";
import { buildComposition, buildExposureSummary } from "./CompositionService";
import { buildScenarioSignals, rankScenarioSignals, buildAttentionCards } from "./ScenarioService";

export interface PortfolioScenarioSummary {
  title: string;
  eventCount: number;
  highSeverityCount: number;
  openEventCount: number;
  netAmountUsd: number | null;
  potentialImpactUsd: number | null;
  organisationCount: number;
}

/**
 * The verified fact package for the manager's *current view* — the whole
 * filtered population, not one selected issue. This is what backs the
 * persistent, context-aware AI panel: whatever the manager is looking at
 * right now (an organisation, a date range, a severity slice) is exactly
 * what gets analysed, because it is built from the same filters the rest
 * of the page is using.
 */
export interface PortfolioDossier {
  filters: NormalizedFilters;
  eventCount: number;
  kpis: KpiSet;
  kpiTrend: KpiDeltas | null;
  composition: CompositionBlock;
  exposure: ExposureBlock;
  topScenarios: PortfolioScenarioSummary[];
  attention: AttentionCard[];
}

export function buildPortfolioDossier(
  filteredEvents: readonly RiskEvent[],
  config: RiskConfig,
  filters: NormalizedFilters,
  repository: RiskRepository,
): PortfolioDossier {
  const scenarios = rankScenarioSignals(
    buildScenarioSignals(filteredEvents, repository.getPatterns(), config, filters),
  );

  return {
    filters,
    eventCount: filteredEvents.length,
    kpis: calculateKPIs(filteredEvents, config, filters),
    kpiTrend: computeKpiDeltas(filteredEvents, config, filters),
    composition: buildComposition(filteredEvents, config),
    exposure: buildExposureSummary(filteredEvents),
    topScenarios: scenarios.slice(0, 5).map((scenario) => ({
      title: scenario.title,
      eventCount: scenario.eventCount,
      highSeverityCount: scenario.highSeverityCount,
      openEventCount: scenario.openEventCount,
      netAmountUsd: scenario.netAmountUsd,
      potentialImpactUsd: scenario.potentialImpactUsd,
      organisationCount: scenario.analytics.recurrence.organisationCount,
    })),
    attention: buildAttentionCards(scenarios),
  };
}
