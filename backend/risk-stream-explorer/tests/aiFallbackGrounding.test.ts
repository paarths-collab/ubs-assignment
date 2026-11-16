import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadRiskDatasetFromDisk } from "../src/repositories/RiskDataLoader";
import { IssueIntelligenceService, buildIssueEvidencePayload } from "../src/services/IssueIntelligenceService";
import { buildIssueFallback, buildPatternFallback } from "../src/routes/ai.routes";
import { checkGrounding, collectResultTexts } from "../src/services/aiGrounding";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
const dataset = loadRiskDatasetFromDisk(dataDir);
const knownEventIds = dataset.eventRepository.getAll().map((e) => e.event_id);
const knownPatternIds = dataset.patternRepository.getAll().map((p) => p.pattern_id);

describe("deterministic fallback text is itself grounded (real synthetic dataset)", () => {
  it("every pattern fallback passes checkGrounding against that pattern's own groq_fact_payload", () => {
    for (const pattern of dataset.patternRepository.getAll()) {
      for (const reason of ["provider-error", "validation-failed"] as const) {
        const texts = collectResultTexts(buildPatternFallback(pattern, reason));
        const result = checkGrounding(texts, {
          evidence: pattern.groq_fact_payload,
          knownEventIds,
          allowedEventIds: pattern.matching_event_ids,
          knownPatternIds,
          allowedPatternIds: [pattern.pattern_id],
        });
        expect({ pattern: pattern.pattern_id, failures: result.failures }).toEqual({ pattern: pattern.pattern_id, failures: [] });
      }
    }
  });

  it("every issue fallback passes checkGrounding against that issue's evidence payload", () => {
    const service = new IssueIntelligenceService(dataset.eventRepository, dataset.patternRepository);
    const slugs = service.getRankedIssues().issues.map((i) => i.slug);
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const profile = service.getProfile(slug)!;
      const evidence = buildIssueEvidencePayload(profile);
      const texts = collectResultTexts(buildIssueFallback(profile, "validation-failed"));
      const result = checkGrounding(texts, {
        evidence,
        knownEventIds,
        allowedEventIds: profile.matchingEventIds,
        knownPatternIds,
        allowedPatternIds: profile.relatedPatterns.map((p) => p.pattern_id),
      });
      expect({ issue: slug, failures: result.failures }).toEqual({ issue: slug, failures: [] });
    }
  });

  it("the fallback explains why it was shown without changing the contractual phrase", () => {
    const pattern = dataset.patternRepository.getAll()[0]!;
    expect(buildPatternFallback(pattern, "provider-timeout").limitations).toContain("verified deterministic fallback");
    expect(buildPatternFallback(pattern, "provider-timeout").limitations).toContain("model was unavailable");
    expect(buildPatternFallback(pattern, "validation-failed").limitations).toContain("could not be verified");
  });
});
