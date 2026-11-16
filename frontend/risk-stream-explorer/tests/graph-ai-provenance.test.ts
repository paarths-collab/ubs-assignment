import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyseResponse } from "../src/graph/ai-client";
import { renderAiResult } from "../src/graph/ai-panel";

/** Small DOM surface for this text-only renderer; no browser layout is involved. */
class TextElement {
  className = "";
  private ownText = "";
  private children: TextElement[] = [];
  get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join(" "); }
  set textContent(text: string) { this.ownText = text; this.children = []; }
  appendChild(child: TextElement) { this.children.push(child); return child; }
  replaceChildren(...children: TextElement[]) { this.ownText = ""; this.children = children; }
  setAttribute() {}
  addEventListener() {}
}

beforeEach(() => {
  vi.stubGlobal("document", {
    createElement: () => new TextElement(),
    createTextNode: (text: string) => { const node = new TextElement(); node.textContent = text; return node; },
  });
});
afterEach(() => vi.unstubAllGlobals());

function response(provenance?: AnalyseResponse["provenance"]): AnalyseResponse {
  return {
    requestId: "test",
    generatedAt: "2026-10-26T12:00:00Z",
    model: "configured-model-name",
    ...(provenance ? { provenance } : {}),
    verifiedFacts: {
      scope: { eventCount: 1, requestedEventCount: 1, droppedEventCount: 0 },
      selectedNode: null,
      severityCounts: { High: 1 },
      eventTypeCounts: { financial: 1, nonFinancial: 0 },
      actualExposure: {
        gross: { total: 100, contributingCount: 1 },
        recovery: { total: 0, contributingCount: 1 },
        net: { total: 100, contributingCount: 1 },
      },
      potentialExposure: { total: null, contributingCount: 0 },
      evidenceEventIds: ["EVT-1"],
    },
    analysis: {
      summary: "Review the selected scope.", observations: [],
      interpretations: [{ statement: "A workflow review may help.", confidence: "low" }],
      investigationQuestions: [], recommendedActions: [], limitations: [],
    },
  };
}

function render(result: AnalyseResponse): string {
  const container = new TextElement();
  renderAiResult(container as unknown as HTMLElement, result, () => {});
  return container.textContent;
}

const validation = { checks: ["schema", "numeric-grounding"], rejectedAttempts: 0 };

describe("relationship analysis source labels", () => {
  it("labels fallback from actual provenance, even when the API includes a configured model", () => {
    const text = render(response({ analysis: "deterministic-fallback", evidence: "computed", cached: false, validation }));
    expect(text).toContain("Deterministic analysis");
    expect(text).toContain("Application template");
    expect(text).toContain("computed evidence");
    expect(text).toContain("Computed summary");
    expect(text).toContain("Suggested interpretation");
    expect(text).not.toContain("AI-generated");
    expect(text).not.toContain("AI summary");
    expect(text).not.toContain("AI interpretation");
    expect(text).not.toContain("configured-model-name");
    expect(text).not.toContain("cached");
  });

  it("credits the model only when the response identifies model-generated text", () => {
    const text = render(response({ analysis: "ai-generated", evidence: "computed", cached: false, validation }));
    expect(text).toContain("AI-generated analysis");
    expect(text).toContain("configured-model-name");
    expect(text).toContain("AI summary");
    expect(text).toContain("AI interpretation");
    expect(text).not.toContain("cached");
  });

  it("shows cache and evidence source only as supplied by provenance", () => {
    const text = render(response({ analysis: "ai-generated", evidence: "stored-pattern", cached: true, validation }));
    expect(text).toContain("stored pattern evidence · cached");
  });

  it("does not guess the source from a model name when legacy responses omit provenance", () => {
    const text = render(response());
    expect(text).toContain("Analysis · source unavailable");
    expect(text).not.toContain("AI-generated");
    expect(text).not.toContain("configured-model-name");
    expect(text).not.toContain("Deterministic analysis");
  });
});
