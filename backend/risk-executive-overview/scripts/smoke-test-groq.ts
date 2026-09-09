/**
 * Manual, real-Groq smoke test for the Manager Assistant. Not part of the
 * automated test suite (which mocks groq-sdk exclusively) — run this by
 * hand after setting GROQ_API_KEY in backend/risk-executive-overview/.env.
 *
 *   npm run smoke:ai --workspace=backend/risk-executive-overview
 */
import { RiskRepository } from "../src/repositories/RiskRepository";
import { normalizeFilters, filterEvents, ENTERPRISE_WIDE } from "../src/services/FilterService";
import { buildAiFactPackage } from "../src/services/AiFactService";
import { generateManagerInsight, isAiConfigured } from "../src/services/GroqService";

async function main(): Promise<void> {
  if (!isAiConfigured()) {
    console.error("GROQ_API_KEY is not set — nothing to smoke test. Set it in backend/risk-executive-overview/.env.");
    process.exitCode = 1;
    return;
  }

  const repository = new RiskRepository();
  const config = repository.getConfig();
  const filters = normalizeFilters({ organisation: ENTERPRISE_WIDE, eventType: "All", severity: "All" }, config);
  const filteredEvents = filterEvents(repository.getEvents(), filters);
  const filteredEventIds = new Set(filteredEvents.map((event) => event.eventId));

  const firstPattern = repository.getPatterns()[0];
  if (!firstPattern) {
    console.error("No patterns available in the dataset.");
    process.exitCode = 1;
    return;
  }

  const factPackage = buildAiFactPackage(
    { type: "pattern", patternId: firstPattern.patternId },
    filters,
    filteredEvents,
    filteredEventIds,
    config,
    repository,
  );

  console.log("Sending fact package:\n", JSON.stringify(factPackage, null, 2));

  const insight = await generateManagerInsight(factPackage);
  console.log("\nGroq manager insight:\n", JSON.stringify(insight, null, 2));
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exitCode = 1;
});
