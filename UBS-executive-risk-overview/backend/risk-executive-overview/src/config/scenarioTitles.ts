/**
 * Short, manager-readable names for the dataset's recurring scenarios.
 *
 * These are display labels only — never facts. The full `issueDetail`
 * sentence always travels alongside the title so nothing is hidden behind a
 * paraphrase, and any scenario not listed here falls back to a mechanical
 * shortening of its own text rather than an invented name.
 */
const CURATED_TITLES: Array<{ match: string; title: string }> = [
  { match: "posted twice after a retry", title: "Duplicate transaction posting" },
  { match: "account attribute was entered with an outdated value", title: "Incorrect account attribute" },
  { match: "client notification was not generated", title: "Missed client notification" },
  { match: "mismatch between the approved instruction", title: "Payment instruction mismatch" },
  { match: "reconciliation difference remained open", title: "Unassigned reconciliation break" },
  { match: "product mapping was linked to the wrong processing rule", title: "Incorrect product mapping" },
  { match: "entitlement remained active after a role change", title: "Stale access entitlement" },
  { match: "batch completed after the expected processing window", title: "Batch processing delay" },
  { match: "fee parameter was applied to an ineligible account", title: "Ineligible fee application" },
  { match: "corporate action instruction was not reflected", title: "Corporate action processing delay" },
  { match: "restriction was recorded in one system but not synchronized", title: "Restriction sync failure" },
  { match: "statements was not delivered", title: "Statement delivery failure" },
  { match: "third-party file changed structure", title: "Vendor file format change" },
  { match: "case was closed before required evidence", title: "Premature case closure" },
  { match: "remained in an unmonitored queue", title: "Unmonitored queue handoff" },
];

const MAX_FALLBACK_LENGTH = 52;

/** Mechanical shortening: first sentence, leading article dropped, trimmed on a word boundary. */
function shortenIssueDetail(issueDetail: string): string {
  const firstSentence = issueDetail.split(". ")[0] ?? issueDetail;
  const withoutArticle = firstSentence.replace(/^(A|An|The)\s+/i, "");
  const capitalised = withoutArticle.charAt(0).toUpperCase() + withoutArticle.slice(1);

  if (capitalised.length <= MAX_FALLBACK_LENGTH) return capitalised.replace(/\.$/, "");

  const clipped = capitalised.slice(0, MAX_FALLBACK_LENGTH);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).replace(/[.,]$/, "")}…`;
}

export function deriveScenarioTitle(issueDetail: string): string {
  const curated = CURATED_TITLES.find((entry) => issueDetail.includes(entry.match));
  return curated ? curated.title : shortenIssueDetail(issueDetail);
}
