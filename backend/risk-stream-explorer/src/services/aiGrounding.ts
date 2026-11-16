/**
 * Pure grounding checks for model-generated text.
 *
 * A language model is only allowed to *describe* evidence the server already
 * verified. These helpers decide, without any I/O, whether a piece of
 * generated text stays inside that evidence:
 *
 *  - Event / pattern ID guard: every ID-looking reference must exist in the
 *    dataset and belong to the evidence set of the current request.
 *  - Model prose is qualitative: quantitative values are rendered by the
 *    deterministic UI/templates, not copied or recombined by the model.
 *
 * The module is provider-neutral and deliberately free of Fastify / dataset
 * imports so the streamgraph and relationship routes can reuse it unchanged.
 *
 * The diagnostic checkGrounding/checkNumbers helpers below compare token
 * membership for trusted templates; they do not establish metric attribution.
 * Only checkModelGrounding is appropriate for untrusted model completions.
 * Diagnostic limitations:
 *  - Number words ("seven", "a dozen") are not interpreted. Only digits are
 *    checked, so a model can still say "seven events" unchecked. The prompts
 *    ask for digits; this is a gap of the check, not a guarantee.
 *  - Numbers that are only *derived* from the evidence (sums, differences,
 *    ratios the model computes itself) are rejected, because they are not in
 *    the payload. That is intentional: derived figures are new claims.
 *  - Narrative numbers that appear inside payload strings are allowed, since
 *    they are part of the evidence the model was given.
 *  - Negative signs are ignored (a delta is compared by absolute value).
 */

// ---------------------------------------------------------------------------
// Event / pattern ID guard
// ---------------------------------------------------------------------------

/** ASCII hyphen plus every unicode dash / minus variant a model might emit. */
const DASH_CHARS = "\\-\\u2010-\\u2015\\u2212\\uFE58\\uFE63\\uFF0D";
/** Separator between the parts of an ID: whitespace, underscore or any dash. */
const SEP = `[\\s_${DASH_CHARS}]`;

/**
 * Event reference: `SIM`, an optional upper-case word (fixture-style
 * `SIM-TEST-0001`), then digits. `SIM`/digits are matched case-insensitively
 * and tolerate any separator (or none): `SIM-25`, `sim 0000025`, `SIM–25`,
 * `SIM_25`, `SIM25`. The optional word must be upper-case so prose such as
 * "SIM data 25" is not misread as an ID.
 */
const EVENT_REF_SOURCE = `(?<![A-Za-z0-9])[Ss][Ii][Mm](?:${SEP}+([A-Z]{2,8}))?${SEP}*(\\d{1,12})(?![A-Za-z0-9])`;
/**
 * Pattern reference: `PAT` + optional upper-case word + digits. Whitespace as
 * the only separator is accepted only for upper-case `PAT` so the first name
 * "Pat 3" is not misread; a dash/underscore (or none) is accepted in any case.
 */
const PATTERN_REF_SOURCE = `(?<![A-Za-z0-9])(?:PAT|[Pp][Aa][Tt](?=[_${DASH_CHARS}\\d]))(?:${SEP}+([A-Z]{2,8}))?${SEP}*(\\d{1,10})(?![A-Za-z0-9])`;

interface RawIdRef {
  /** Upper-case prefix key including any word part, e.g. "SIM" or "SIMTEST". */
  prefixKey: string;
  /** Display prefix, e.g. "SIM" or "SIM-TEST". */
  prefixDisplay: string;
  digits: string;
}

function extractRefs(text: string, source: string, base: "SIM" | "PAT"): RawIdRef[] {
  const re = new RegExp(source, "g");
  const refs: RawIdRef[] = [];
  for (const match of text.matchAll(re)) {
    const word = match[1];
    refs.push({
      prefixKey: word ? `${base}${word}` : base,
      prefixDisplay: word ? `${base}-${word}` : base,
      digits: match[2] as string,
    });
  }
  return refs;
}

/**
 * Resolves tolerant references to the dataset's canonical IDs. An index may
 * overlay a parent (the cached dataset-wide index) so per-request additions
 * never mutate shared state.
 */
export class CanonicalIdIndex {
  private readonly byKey = new Map<string, string>();
  private readonly byNumber = new Map<string, string>();
  private readonly widths = new Map<string, number>();

  constructor(ids: Iterable<string>, private readonly parent?: CanonicalIdIndex) {
    for (const id of ids) this.add(id);
  }

  add(id: string): void {
    const key = id.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!this.byKey.has(key)) this.byKey.set(key, id);
    const m = /^(.*?)(\d+)$/.exec(id);
    if (!m) return;
    const prefixKey = (m[1] as string).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const digits = m[2] as string;
    const numKey = `${prefixKey}#${Number(digits)}`;
    if (!this.byNumber.has(numKey)) this.byNumber.set(numKey, id);
    this.widths.set(prefixKey, Math.max(this.widths.get(prefixKey) ?? 0, digits.length));
  }

  private lookupKey(key: string): string | undefined {
    return this.byKey.get(key) ?? this.parent?.lookupKey(key);
  }

  private lookupNumber(key: string): string | undefined {
    return this.byNumber.get(key) ?? this.parent?.lookupNumber(key);
  }

  private width(prefixKey: string): number {
    return Math.max(this.widths.get(prefixKey) ?? 0, this.parent?.width(prefixKey) ?? 0);
  }

  has(id: string): boolean {
    return this.lookupKey(id.toUpperCase().replace(/[^A-Z0-9]/g, "")) !== undefined;
  }

  /** Returns `{ canonical, known }`; unknown references get a best-effort canonical-looking form. */
  resolve(ref: RawIdRef): { canonical: string; known: boolean } {
    const direct = this.lookupKey(`${ref.prefixKey}${ref.digits}`);
    if (direct) return { canonical: direct, known: true };
    const numeric = this.lookupNumber(`${ref.prefixKey}#${Number(ref.digits)}`);
    if (numeric) return { canonical: numeric, known: true };
    const width = this.width(ref.prefixKey);
    const digits = ref.digits.length < width ? ref.digits.padStart(width, "0") : ref.digits;
    return { canonical: `${ref.prefixDisplay}-${digits}`, known: false };
  }
}

const indexCache = new WeakMap<object, CanonicalIdIndex>();

/** Builds (and, for arrays/sets, memoises) the dataset-wide index so a 1000-event dataset is not re-indexed on every request. */
function indexFor(ids: Iterable<string>): CanonicalIdIndex {
  if (typeof ids === "object" && (Array.isArray(ids) || ids instanceof Set)) {
    const cached = indexCache.get(ids);
    if (cached) return cached;
    const built = new CanonicalIdIndex(ids);
    indexCache.set(ids, built);
    return built;
  }
  return new CanonicalIdIndex(ids);
}

/** Known IDs plus a per-call overlay of IDs the request itself vouches for. */
function indexWith(known: Iterable<string>, extra: Iterable<string>): CanonicalIdIndex {
  return new CanonicalIdIndex(extra, indexFor(known));
}

export interface EventIdReport {
  /** Canonical IDs referenced anywhere in the texts (deduplicated). */
  mentioned: string[];
  /** Referenced IDs that do not exist anywhere in the dataset. */
  unknownEventIds: string[];
  /** Referenced IDs that exist but are not part of this request's evidence set. */
  outOfScopeEventIds: string[];
}

export interface PatternIdReport {
  mentioned: string[];
  unknownPatternIds: string[];
  /** Only populated when an allowed set is supplied. */
  outOfScopePatternIds: string[];
}

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

/**
 * Extracts event references from `texts` (tolerant, case-insensitive),
 * normalises them to the dataset's canonical form and classifies each one.
 *
 * @param knownEventIds   the full dataset ID index
 * @param allowedEventIds the IDs this request's evidence covers
 */
export function checkEventIds(
  texts: readonly string[],
  knownEventIds: Iterable<string>,
  allowedEventIds: Iterable<string>,
): EventIdReport {
  const allowed = new Set(allowedEventIds);
  const index = indexWith(knownEventIds, allowed);
  const report: EventIdReport = { mentioned: [], unknownEventIds: [], outOfScopeEventIds: [] };
  for (const text of texts) {
    for (const ref of extractRefs(text, EVENT_REF_SOURCE, "SIM")) {
      const { canonical, known } = index.resolve(ref);
      pushUnique(report.mentioned, canonical);
      if (!known) pushUnique(report.unknownEventIds, canonical);
      else if (!allowed.has(canonical)) pushUnique(report.outOfScopeEventIds, canonical);
    }
  }
  return report;
}

/** Same as {@link checkEventIds} for `PAT-` pattern IDs. Unknown IDs are always reported; out-of-scope only when `allowedPatternIds` is given. */
export function checkPatternIds(
  texts: readonly string[],
  knownPatternIds: Iterable<string>,
  allowedPatternIds?: Iterable<string>,
): PatternIdReport {
  const allowed = allowedPatternIds ? new Set(allowedPatternIds) : null;
  const index = indexWith(knownPatternIds, allowed ?? []);
  const report: PatternIdReport = { mentioned: [], unknownPatternIds: [], outOfScopePatternIds: [] };
  for (const text of texts) {
    for (const ref of extractRefs(text, PATTERN_REF_SOURCE, "PAT")) {
      const { canonical, known } = index.resolve(ref);
      pushUnique(report.mentioned, canonical);
      if (!known) pushUnique(report.unknownPatternIds, canonical);
      else if (allowed && !allowed.has(canonical)) pushUnique(report.outOfScopePatternIds, canonical);
    }
  }
  return report;
}

/** Replaces every event / pattern reference with a space so their digits are never read as figures. */
function stripIdRefs(text: string): string {
  return text.replace(new RegExp(EVENT_REF_SOURCE, "g"), " ").replace(new RegExp(PATTERN_REF_SOURCE, "g"), " ");
}

// ---------------------------------------------------------------------------
// Numeric grounding
// ---------------------------------------------------------------------------

type Unit = "none" | "percent" | "pp" | "multiple" | "currency" | "magnitude" | "count";

interface NumericToken {
  /** Text as it appeared (number plus unit), for failure messages. */
  raw: string;
  /** The number as written (before any k/m/bn scaling), always non-negative. */
  mantissa: number;
  /** Multiplier implied by a k/m/bn/million/billion suffix (1 when none). */
  scale: number;
  /** Decimal places written in the mantissa. */
  dp: number;
  unit: Unit;
  /** True for a plain 4-digit integer that can be read as a calendar year. */
  yearLike: boolean;
}

interface DateToken {
  raw: string;
  /** ISO `YYYY-MM` or `YYYY-MM-DD`. */
  iso: string;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

const ISO_DATE_RE = /(?<![\d.])((?:19|20)\d{2})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?(?![\d])/g;
const MONTH_NAME_DATE_RE =
  /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?(?:\s+(\d{1,2})(?:st|nd|rd|th)?,?)?\s+((?:19|20)\d{2})\b/gi;
/** Numbered-list marker at the start of a line / string: "1.", "2)", "(3)". */
const LIST_MARKER_RE = /^[ \t]*(?:\(\d{1,2}\)|\d{1,2}[.)])[ \t]+/gm;
const NUMBER_RE =
  /(?<![A-Za-z0-9_.])([$£€¥]\s?|(?:USD|EUR|GBP|CHF|JPY|CAD|AUD)\s?)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/gi;

/** Words that may sit between a number and its unit noun ("3 matching events") but never do in an unrelated phrase. */
const CONNECTOR_WORDS = new Set([
  "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "with", "by", "the", "than", "per", "from", "as",
  "is", "are", "was", "were", "be", "been", "that", "which", "over", "under", "across", "after", "before", "vs", "versus",
]);
const COUNT_UNIT_RE =
  /^(?:events?|incidents?|cases?|records?|days?|hours?|minutes?|weeks?|months?|years?|patterns?|issues?|organi[sz]ations?|orgs?|owners?|assignees?|signals?|breakdowns?|transactions?|items?)\b/i;
const MAGNITUDE_WORDS: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const MAGNITUDE_LETTERS: Record<string, number> = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9 };

function countDecimals(num: string): number {
  const dot = num.indexOf(".");
  return dot === -1 ? 0 : num.length - dot - 1;
}

function normaliseWhitespace(text: string): string {
  return text.replace(/[    ]/g, " ");
}

/** Removes date expressions from `text` (replaced by spaces) and returns them separately. */
function extractDates(text: string): { rest: string; dates: DateToken[] } {
  const dates: DateToken[] = [];
  let rest = text.replace(MONTH_NAME_DATE_RE, (raw, day: string | undefined, month: string, day2: string | undefined, year: string) => {
    const mm = MONTHS[month.slice(0, 3).toLowerCase()] as string;
    const d = day ?? day2;
    dates.push({ raw: raw.trim(), iso: d ? `${year}-${mm}-${d.padStart(2, "0")}` : `${year}-${mm}` });
    return " ";
  });
  rest = rest.replace(ISO_DATE_RE, (raw, year: string, month: string, day: string | undefined) => {
    dates.push({ raw, iso: day ? `${year}-${month}-${day}` : `${year}-${month}` });
    return " ";
  });
  return { rest, dates };
}

function parseSuffix(rest: string, hasCurrency: boolean): { unit: Unit; scale: number; length: number } {
  let m: RegExpExecArray | null;
  if ((m = /^\s?(?:%|percent\b|per\s?cent\b|pct\b)/i.exec(rest))) return { unit: "percent", scale: 1, length: m[0].length };
  if ((m = /^\s?(?:pp\b|ppt\b|percentage\s+points?\b)/i.exec(rest))) return { unit: "pp", scale: 1, length: m[0].length };
  if ((m = /^(?:\s?×|x\b)/i.exec(rest))) return { unit: "multiple", scale: 1, length: m[0].length };
  if ((m = /^\s(?:times)\b/i.exec(rest))) return { unit: "multiple", scale: 1, length: m[0].length };
  if ((m = /^(bn|mn|k|m|b)\b/i.exec(rest))) {
    return { unit: hasCurrency ? "currency" : "magnitude", scale: MAGNITUDE_LETTERS[(m[1] as string).toLowerCase()] as number, length: m[0].length };
  }
  if ((m = /^\s(thousand|million|billion|trillion)\b/i.exec(rest))) {
    return { unit: hasCurrency ? "currency" : "magnitude", scale: MAGNITUDE_WORDS[(m[1] as string).toLowerCase()] as number, length: m[0].length };
  }
  if ((m = /^\s?(?:USD|EUR|GBP|CHF|JPY|CAD|AUD|dollars?|euros?|pounds?)\b/i.exec(rest))) return { unit: "currency", scale: 1, length: m[0].length };
  if (/^(?:st|nd|rd|th)\b/i.test(rest)) return { unit: "none", scale: 1, length: 0 };

  // A count noun ("3 events", "3 High-severity events", "30-day"): allow up to
  // two content words between the number and the noun.
  const hyphen = /^-(?:events?|incidents?|cases?|records?|days?|hours?|weeks?|months?|years?)\b/i.exec(rest);
  if (hyphen) return { unit: "count", scale: 1, length: hyphen[0].length };
  let pos = 0;
  for (let i = 0; i < 3; i += 1) {
    const word = /^\s+([A-Za-z][A-Za-z-]*)/.exec(rest.slice(pos));
    if (!word) break;
    pos += word[0].length;
    const w = (word[1] as string).toLowerCase();
    if (COUNT_UNIT_RE.test(w)) return { unit: "count", scale: 1, length: pos };
    if (CONNECTOR_WORDS.has(w)) break;
  }
  return { unit: "none", scale: 1, length: 0 };
}

/** Extracts every figure from `text` (dates and ID digits are handled/removed first). */
export function extractNumericTokens(text: string): NumericToken[] {
  const tokens: NumericToken[] = [];
  const cleaned = stripIdRefs(normaliseWhitespace(text)).replace(LIST_MARKER_RE, "");
  const { rest: noDates } = extractDates(cleaned);
  for (const match of noDates.matchAll(NUMBER_RE)) {
    const cur = match[1];
    const num = match[2] as string;
    const start = match.index as number;
    const end = start + match[0].length;
    const suffix = parseSuffix(noDates.slice(end), Boolean(cur));
    const mantissa = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(mantissa)) continue;
    const unit: Unit = cur ? "currency" : suffix.unit;
    tokens.push({
      raw: noDates.slice(start, end + suffix.length).replace(/\s+/g, " ").trim(),
      mantissa,
      scale: suffix.scale,
      dp: countDecimals(num),
      unit,
      yearLike: !cur && suffix.unit === "none" && /^(?:19|20)\d{2}$/.test(num),
    });
  }
  return tokens;
}

/** Every distinct string in a JSON-like value, including object keys. */
function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 40) return out;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out, depth + 1);
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out.push(key);
      collectStrings(item, out, depth + 1);
    }
  }
  return out;
}

/** Collects every string in a structured model result (for running the checks over all of it). */
export function collectResultTexts(result: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown, depth: number): void => {
    if (depth > 40) return;
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const item of value) walk(item, depth + 1);
    else if (value && typeof value === "object") for (const item of Object.values(value as Record<string, unknown>)) walk(item, depth + 1);
  };
  walk(result, 0);
  return out;
}

interface EvidenceNumbers {
  values: number[];
  corpus: string;
  years: Set<string>;
}

function collectEvidenceNumbers(evidence: unknown): EvidenceNumbers {
  const values = new Set<number>();
  const strings: string[] = [];
  const walk = (value: unknown, depth: number): void => {
    if (depth > 40) return;
    if (typeof value === "number" && Number.isFinite(value)) values.add(Math.abs(value));
    else if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) {
      // List lengths ("5 matching events") are facts the payload implies.
      if (value.length > 0) values.add(value.length);
      for (const item of value) walk(item, depth + 1);
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        strings.push(key);
        walk(item, depth + 1);
      }
    }
  };
  walk(evidence, 0);

  for (const text of strings) {
    for (const token of extractNumericTokens(text)) {
      values.add(token.mantissa);
      values.add(token.mantissa * token.scale);
    }
  }
  const corpus = strings.join("\n").toLowerCase();
  const years = new Set<string>(corpus.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/g) ?? []);
  return { values: [...values], corpus, years };
}

/** True when written value `t` (with `dp` decimals) is `x` exactly or `x` correctly rounded to `dp` decimals. */
function matchesRounded(t: number, dp: number, x: number, scaled: boolean): boolean {
  if (Math.abs(t - x) <= 1e-9 * Math.max(1, Math.abs(x))) return true;
  if (dp > 4) return false;
  // Rounding a sub-unit value (or a small abbreviated amount) to a whole number loses too much to count as the same figure.
  if (dp === 0 && Math.abs(x) < (scaled ? 10 : 1)) return false;
  if (t === 0) return false;
  return Math.abs(t - x) <= 0.5 * 10 ** -dp + 1e-9;
}

/** Fraction <-> percent renderings and the absolute value of an evidence number. */
function variantsOf(a: number): number[] {
  const out = [a];
  if (a > 0 && a <= 1) out.push(a * 100);
  if (a > 1 && a <= 100) out.push(a / 100);
  return out;
}

function isNumberGrounded(token: NumericToken, evidence: EvidenceNumbers): boolean {
  for (const a of evidence.values) {
    if (token.scale === 1) {
      for (const v of variantsOf(a)) if (matchesRounded(token.mantissa, token.dp, v, false)) return true;
    } else {
      // "$2.5m": compare the written mantissa to the evidence amount expressed in that magnitude.
      if (matchesRounded(token.mantissa, token.dp, a / token.scale, true)) return true;
      // The evidence itself may already be abbreviated; compare absolute values too.
      if (matchesRounded(token.mantissa * token.scale, token.dp, a, false)) return true;
    }
  }
  return false;
}

export interface NumericGroundingReport {
  /** Figures (as written) that cannot be traced to the evidence payload. */
  ungroundedNumbers: string[];
  /** Dates / years (as written) that do not appear in the evidence payload. */
  ungroundedDates: string[];
}

/**
 * Checks every figure in `texts` against the numbers in `evidence`.
 *
 * Rules:
 *  - IDs (SIM-/PAT-) and numbered-list markers at the start of a line are ignored.
 *  - A bare integer from 0 to 10 with no unit is exempt: those are list counts
 *    and ordinals ("two questions", "step 3") that carry no factual claim.
 *  - Any figure attached to a unit (%, pp, x/times, currency symbol or code,
 *    k/m/bn, or a unit word such as events/incidents/cases/records/days/hours/
 *    months/patterns/issues) must be grounded regardless of size, and so must
 *    any bare number above 10 or with decimals.
 *  - Accepted renderings of an evidence number: itself, its absolute value,
 *    fraction <-> percent (x100 for values up to 1, /100 for values up to 100),
 *    rounding to the number of decimals written (up to 4; whole-number rounding
 *    only for values of at least 1), thousands separators, and k/m/bn/million/
 *    billion abbreviations (whole-number abbreviations only for values of at
 *    least 10 in that magnitude).
 *  - Dates and years must appear in the evidence payload.
 */
export function checkNumbers(texts: readonly string[], evidence: unknown): NumericGroundingReport {
  const ev = collectEvidenceNumbers(evidence);
  const report: NumericGroundingReport = { ungroundedNumbers: [], ungroundedDates: [] };

  for (const text of texts) {
    const cleaned = stripIdRefs(normaliseWhitespace(text)).replace(LIST_MARKER_RE, "");
    for (const date of extractDates(cleaned).dates) {
      const grounded = ev.corpus.includes(date.iso) || ev.corpus.includes(date.raw.toLowerCase());
      if (!grounded) pushUnique(report.ungroundedDates, date.raw);
    }
    for (const token of extractNumericTokens(text)) {
      if (token.unit === "none") {
        if (token.yearLike && token.mantissa >= 1900 && token.mantissa <= 2100) {
          if (!ev.years.has(String(token.mantissa)) && !isNumberGrounded(token, ev)) pushUnique(report.ungroundedDates, token.raw);
          continue;
        }
        if (Number.isInteger(token.mantissa) && token.dp === 0 && token.mantissa <= 10) continue;
      }
      if (!isNumberGrounded(token, ev)) pushUnique(report.ungroundedNumbers, token.raw);
    }
  }
  return report;
}

// ---------------------------------------------------------------------------
// Combined check
// ---------------------------------------------------------------------------

export interface GroundingContext {
  /** The evidence payload that was actually sent to the model. Omit to skip numeric grounding. */
  evidence?: unknown;
  /** Every event ID in the dataset. Arrays/Sets are indexed once and memoised by identity, so pass a stable, unmutated collection. */
  knownEventIds: Iterable<string>;
  /** Event IDs this request's evidence covers (IDs found inside `evidence` are added automatically). */
  allowedEventIds: Iterable<string>;
  /** Every pattern ID in the dataset. Omit to skip the pattern-ID guard. */
  knownPatternIds?: Iterable<string>;
  /** Pattern IDs this request's evidence covers; when omitted only unknown IDs are rejected. */
  allowedPatternIds?: Iterable<string>;
}

export interface GroundingResult {
  ok: boolean;
  /** Stable machine-readable strings, e.g. `unknown-event-id:SIM-9999999`, `ungrounded-number:42%`. */
  failures: string[];
  /** Names of the checks that ran and passed. */
  checks: string[];
}

/** IDs mentioned inside the evidence payload itself are in scope by definition. */
function evidenceIds(evidence: unknown, source: string, base: "SIM" | "PAT", index: CanonicalIdIndex): string[] {
  const out: string[] = [];
  for (const text of collectStrings(evidence)) {
    for (const ref of extractRefs(text, source, base)) {
      const { canonical, known } = index.resolve(ref);
      if (known) out.push(canonical);
    }
  }
  return out;
}

export function checkGrounding(texts: readonly string[], ctx: GroundingContext): GroundingResult {
  const failures: string[] = [];
  const checks: string[] = [];

  const knownEvents = ctx.knownEventIds;
  const allowedEvents = new Set(ctx.allowedEventIds);
  if (ctx.evidence !== undefined) {
    const index = indexWith(knownEvents, allowedEvents);
    for (const id of evidenceIds(ctx.evidence, EVENT_REF_SOURCE, "SIM", index)) allowedEvents.add(id);
  }
  const events = checkEventIds(texts, knownEvents, allowedEvents);
  for (const id of events.unknownEventIds) failures.push(`unknown-event-id:${id}`);
  for (const id of events.outOfScopeEventIds) failures.push(`out-of-scope-event-id:${id}`);
  if (events.unknownEventIds.length === 0 && events.outOfScopeEventIds.length === 0) checks.push("event-ids");

  if (ctx.knownPatternIds) {
    const knownPatterns = ctx.knownPatternIds;
    let allowedPatterns: Set<string> | undefined;
    if (ctx.allowedPatternIds) {
      allowedPatterns = new Set(ctx.allowedPatternIds);
      if (ctx.evidence !== undefined) {
        const index = indexWith(knownPatterns, allowedPatterns);
        for (const id of evidenceIds(ctx.evidence, PATTERN_REF_SOURCE, "PAT", index)) allowedPatterns.add(id);
      }
    }
    const patterns = checkPatternIds(texts, knownPatterns, allowedPatterns);
    for (const id of patterns.unknownPatternIds) failures.push(`unknown-pattern-id:${id}`);
    for (const id of patterns.outOfScopePatternIds) failures.push(`out-of-scope-pattern-id:${id}`);
    if (patterns.unknownPatternIds.length === 0 && patterns.outOfScopePatternIds.length === 0) checks.push("pattern-ids");
  }

  if (ctx.evidence !== undefined) {
    const numbers = checkNumbers(texts, ctx.evidence);
    for (const n of numbers.ungroundedNumbers) failures.push(`ungrounded-number:${n}`);
    for (const d of numbers.ungroundedDates) failures.push(`ungrounded-date:${d}`);
    if (numbers.ungroundedNumbers.length === 0 && numbers.ungroundedDates.length === 0) checks.push("numeric-grounding");
  }

  return { ok: failures.length === 0, failures, checks };
}

/** Shared contract for untrusted completions on every analysis surface. */
export const MODEL_PROSE_RULES = "Write qualitative analysis only. Do not include numerical claims, amounts, percentages, dates, or counts (including spelled-out counts). The application displays quantitative facts separately. You may cite only Event IDs present in the supplied evidence. Use unnumbered headings and bullets. Never copy facts from the user's question.";

const NUMBER_WORD_RE = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|trillions?|dozens?|half|halves|quarters?)\b/gi;
const NUMBER_WORD_EXACT_RE = new RegExp(`^(?:${NUMBER_WORD_RE.source})$`, "i");
const MAGNITUDE_WORD_RE = /^(?:hundreds?|thousands?|millions?|billions?|trillions?|dozens?)$/i;
const QUANTITY_UNIT_RE = /^(?:percent|percentage|pct|pp|ppt|bps|basis|USD|EUR|GBP|CHF|JPY|CAD|AUD|dollars?|euros?|pounds?|francs?|yen|rupees?|seconds?|times|fold)$/i;
const CURRENCY_WORD_RE = /(?:\b(?:USD|EUR|GBP|CHF|JPY|CAD|AUD|dollars?|euros?|pounds?|francs?|yen|rupees?)|[$£€¥])\s*$/i;

/** Recognises ordinary quantity phrases without banning "one possible explanation". */
function wordQuantities(text: string): string[] {
  // Model prose commonly wraps quantities in emphasis or inline code.
  text = text.replace(/[*`]/g, "").replace(/_/g, " ");
  const quantities: string[] = [];
  for (const start of text.matchAll(NUMBER_WORD_RE)) {
    let end = start.index + start[0].length;
    // Other number words already express a quantity even without a unit
    // ("ten remained unresolved"). Only "one" has a common qualitative use
    // that needs context, such as "one possible explanation".
    if (start[0].toLowerCase() !== "one" || CURRENCY_WORD_RE.test(text.slice(0, start.index))) {
      quantities.push(start[0]);
      continue;
    }
    const symbol = /^\s*[%‰]/.exec(text.slice(end));
    if (symbol) {
      quantities.push(text.slice(start.index, end + symbol[0].length));
      continue;
    }
    let modifiers = 0;
    // Compound numbers and a small adjective phrase: "twenty-one affected
    // transactions", "three hundred and twenty hours", "ten million USD".
    for (let part = 0; part < 12; part += 1) {
      const next = /^[-\s]+([a-z]+)\b/i.exec(text.slice(end));
      if (!next) break;
      const word = next[1] as string;
      end += next[0].length;
      if (COUNT_UNIT_RE.test(word) || QUANTITY_UNIT_RE.test(word) || MAGNITUDE_WORD_RE.test(word)) {
        quantities.push(text.slice(start.index, end));
        break;
      }
      if (/^point$/i.test(word) || NUMBER_WORD_EXACT_RE.test(word)) {
        quantities.push(text.slice(start.index, end));
        break;
      }
      if (/^and$/i.test(word)) continue;
      // "per cent" and fractional expressions are quantities too.
      if (/^per$/i.test(word) && /^\s+cent\b/i.test(text.slice(end))) {
        quantities.push(text.slice(start.index, end + (/^\s+cent\b/i.exec(text.slice(end))?.[0].length ?? 0)));
        break;
      }
      if (/^(?:of|the)$/i.test(word)) continue;
      if (CONNECTOR_WORDS.has(word.toLowerCase()) || ++modifiers > 2) break;
    }
  }
  return quantities;
}

/**
 * A value occurring somewhere in a payload does not verify its metric, unit,
 * sign, or attribution in prose. Reject quantitative model claims even when
 * their digits happen to match another field. checkGrounding/checkNumbers
 * remain useful diagnostics for trusted deterministic templates; all model
 * consumers must use this stricter entry point before publishing any text.
 */
export function checkModelGrounding(texts: readonly string[], ctx: GroundingContext): GroundingResult {
  const base = checkGrounding(texts, ctx);
  const failures = [...base.failures];
  for (const text of texts) {
    const cleaned = stripIdRefs(normaliseWhitespace(text)).replace(LIST_MARKER_RE, "");
    const figures = [...extractNumericTokens(text).map((t) => t.raw), ...extractDates(cleaned).dates.map((d) => d.raw)];
    for (const figure of figures) {
      if (!failures.includes(`ungrounded-number:${figure}`) && !failures.includes(`ungrounded-date:${figure}`)) {
        pushUnique(failures, `unverified-quantitative-claim:${figure}`);
      }
    }
    // The diagnostic parser is deliberately permissive about labels and
    // formatting. Model prose cannot use those gaps to publish a quantity:
    // after citations/list markers are removed, any residual digit or Unicode
    // number (including fractions) violates the qualitative-only contract.
    if (figures.length === 0) {
      for (const match of cleaned.matchAll(/\p{N}+/gu)) pushUnique(failures, `unverified-quantitative-claim:${match[0]}`);
    }
    for (const quantity of wordQuantities(cleaned)) pushUnique(failures, `unverified-quantitative-claim:${quantity}`);
  }
  return {
    ok: failures.length === 0,
    failures,
    checks: failures.some((f) => /^(?:unverified-quantitative|ungrounded-number|ungrounded-date)/.test(f))
      ? base.checks.filter((c) => c !== "numeric-grounding") : base.checks,
  };
}
