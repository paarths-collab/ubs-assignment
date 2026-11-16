import { describe, expect, it } from "vitest";
import { FLOW_TEMPLATES, flowTemplate } from "../src/graph/flow-model";
import { chooseFlowTemplate } from "../src/graph/ai-guidance";

describe("saved investigation flow templates", () => {
  it("keeps the AI choices limited to the existing deterministic views", () => {
    expect(FLOW_TEMPLATES.map((template) => template.id)).toEqual([
      "issue-investigation",
      "organisation-concentration",
      "workflow-people",
      "full-risk-chain",
    ]);
    expect(FLOW_TEMPLATES.map((template) => template.viewMode)).toEqual(["causes", "issues", "people", "full"]);
  });

  it("falls back to the simple issue investigation template", () => {
    expect(flowTemplate("issue-investigation").label).toBe("Issue → Root Cause");
  });

  it("maps analyst wording to a saved template", () => {
    expect(chooseFlowTemplate("show the people and assignee workflow")).toBe("workflow-people");
    expect(chooseFlowTemplate("where is the organisation concentration?")).toBe("organisation-concentration");
    expect(chooseFlowTemplate("show the full chain")).toBe("full-risk-chain");
    expect(chooseFlowTemplate("investigate repeated issues")).toBe("issue-investigation");
  });
});
