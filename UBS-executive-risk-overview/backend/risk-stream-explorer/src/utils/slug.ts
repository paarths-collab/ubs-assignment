/**
 * Issue names ("Corporate action instruction gap") appear in URLs as slugs
 * ("corporate-action-instruction-gap"). Slugification is one-way; resolving
 * a slug back to its issue name always goes through a lookup table built
 * from the known issue list (see `IssueIntelligenceService`), never by
 * trying to reverse the transform.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
