import { describe, expect, it } from "vitest";
import { buildPortfolioDossier } from "../src/services/PortfolioDossierService";
import { computeKpiDeltas } from "../src/services/KpiService";
import { buildScenarioSignals, rankScenarioSignals, buildAttentionCards } from "../src/services/ScenarioService";
import { PORTFOLIO_ANALYSIS_SECTIONS, ANALYST_SYSTEM_PROMPT } from "../src/services/AIAnalysisOrchestrator";
import { RiskRepository } from "../src/repositories/RiskRepository";
import { normalizeFilters, filterEvents, ENTERPRISE_WIDE } from "../src/services/FilterService";

/**
 * The verified fact package for the persistent, context-aware AI panel.
 * Built by composing the same services the rest of the API already uses —
 * these tests assert that composition, not re-derive the maths (which is
 * already covered by kpiDeltas.test.ts, scenarioService.test.ts etc).
 */
describe("buildPortfolioDossier", () => {
  const repository = new RiskRepository();
  const config = repository.getConfig();
  const filters = normalizeFilters({ organisation: ENTERPRISE_WIDE, eventType: "All", severity: "All" }, config);
  const filteredEvents = filterEvents(repository.getEvents(), filters);

  it("eventCount matches the filtered population exactly", () => {
    const dossier = buildPortfolioDossier(filteredEvents, config, filters, repository);
    expect(dossier.eventCount).toBe(filteredEvents.length);
    expect(dossier.eventCount).toBe(1000);
  });

  it("kpiTrend is identical to calling computeKpiDeltas directly — no independent recomputation", () => {
    const dossier = buildPortfolioDossier(filteredEvents, config, filters, repository);
    const expectedDeltas = computeKpiDeltas(filteredEvents, config, filters);
    expect(dossier.kpiTrend).toEqual(expectedDeltas);
  });

  it("attention matches buildAttentionCards on the same scenario ranking — no independent recomputation", () => {
    const dossier = buildPortfolioDossier(filteredEvents, config, filters, repository);
    const scenarios = rankScenarioSignals(
      buildScenarioSignals(filteredEvents, repository.getPatterns(), config, filters),
    );
    expect(dossier.attention).toEqual(buildAttentionCards(scenarios));
  });

  it("topScenarios is capped at 5 and ordered by the same ranking as /api/priority-signals", () => {
    const dossier = buildPortfolioDossier(filteredEvents, config, filters, repository);
    const scenarios = rankScenarioSignals(
      buildScenarioSignals(filteredEvents, repository.getPatterns(), config, filters),
    );

    expect(dossier.topScenarios).toHaveLength(5);
    expect(dossier.topScenarios.map((s) => s.title)).toEqual(scenarios.slice(0, 5).map((s) => s.title));
  });

  it("topScenarios carries organisationCount sourced from recurrence analytics, not left undefined", () => {
    const dossier = buildPortfolioDossier(filteredEvents, config, filters, repository);
    for (const scenario of dossier.topScenarios) {
      expect(typeof scenario.organisationCount).toBe("number");
      expect(scenario.organisationCount).toBeGreaterThan(0);
    }
  });

  it("serialises to JSON cleanly — this object is sent verbatim to the model", () => {
    const dossier = buildPortfolioDossier(filteredEvents, config, filters, repository);
    expect(() => JSON.stringify(dossier)).not.toThrow();
    const roundTripped = JSON.parse(JSON.stringify(dossier));
    expect(roundTripped.eventCount).toBe(dossier.eventCount);
  });

  it("reflects a narrower filter (fewer events, different composition) rather than always describing the whole dataset", () => {
    const severityFilters = normalizeFilters({ organisation: ENTERPRISE_WIDE, eventType: "All", severity: "High" }, config);
    const narrowEvents = filterEvents(repository.getEvents(), severityFilters);
    const narrowDossier = buildPortfolioDossier(narrowEvents, config, severityFilters, repository);

    expect(narrowDossier.eventCount).toBeLessThan(1000);
    expect(narrowDossier.eventCount).toBe(51); // known High-severity anchor
  });
});

describe("PORTFOLIO_ANALYSIS_SECTIONS", () => {
  it("defines exactly the three lenses the panel exposes", () => {
    expect(Object.keys(PORTFOLIO_ANALYSIS_SECTIONS).sort()).toEqual(["analyse", "investigate", "unusual"]);
  });

  it("every section has a non-empty id, title and prompt, and medium reasoning effort", () => {
    for (const section of Object.values(PORTFOLIO_ANALYSIS_SECTIONS)) {
      expect(section.id.length).toBeGreaterThan(0);
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.prompt.length).toBeGreaterThan(0);
      expect(section.reasoningEffort).toBe("medium");
    }
  });

  it("section ids are unique and namespaced so they can't collide with the per-issue section ids", () => {
    const ids = Object.values(PORTFOLIO_ANALYSIS_SECTIONS).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("portfolio-")).toBe(true);
  });

  it("the shared analyst system prompt still forbids the model from calculating facts and from personal-blame framing", () => {
    expect(ANALYST_SYSTEM_PROMPT.toLowerCase()).toContain("must not invent or recalculate");
    expect(ANALYST_SYSTEM_PROMPT.toLowerCase()).toContain("workflow concentration");
  });
});
