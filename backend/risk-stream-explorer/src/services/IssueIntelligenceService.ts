import type { RiskEventRepository } from "../repositories/RiskEventRepository";
import type { PatternRepository } from "../repositories/PatternRepository";
import type { EnterpriseBaseline, RiskEvent } from "../types/RiskEvent";
import type {
  IssueDetailResponse,
  IssueEvidencePayload,
  IssueFinancials,
  IssueOpenWorkload,
  IssueProfile,
  IssueSeveritySummary,
  IssuesListResponse,
  IssueSummary,
  IssueTimeliness,
  IssueTrend,
  NetExposureConcentration,
  OrganisationBreakdownEntry,
  RelatedPatternRef,
  RootCauseBreakdownEntry,
  SignalId,
  TimelinessMetric,
  TriggeredSignal,
  WorkflowConcentrationEntry,
} from "../types/Issue";
import { ISSUE_SIGNAL_THRESHOLDS as T, SIGNAL_LABELS, SIGNAL_WEIGHTS } from "../config/issueSignals";
import { aggregateMoney, groupBy, meanNullable, medianNullable, round1, round2 } from "../utils/riskMath";
import { slugify } from "../utils/slug";

/** Shifts a "YYYY-MM" occurrence-month string by `delta` months (may be negative). */
function shiftMonth(monthStr: string, delta: number): string {
  const parts = monthStr.split("-").map(Number);
  const year = parts[0] as number;
  const month = parts[1] as number;
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function inMonthRange(month: string, start: string, end: string): boolean {
  return month >= start && month <= end;
}

/**
 * Computes and caches an Issue Intelligence Profile for each of the 15
 * distinct `issue` values in `risk_events_final.json`, plus a transparent,
 * deterministic ranking across them. Everything is computed once at
 * construction time (startup) and served from memory thereafter — no
 * per-request recomputation, so repeated `GET /api/issues*` calls are O(1)
 * lookups.
 *
 * This service is the "why am I seeing this" layer: every ranked issue
 * carries the specific named signals (see `../config/issueSignals.ts`) that
 * triggered for it, each with the real number behind it. There is no
 * opaque composite AI score — `rankScore` is just the documented sum of
 * triggered-signal weights, always shown alongside the signals themselves.
 */
export class IssueIntelligenceService {
  private readonly profilesBySlug = new Map<string, IssueProfile>();
  private readonly rankedSummaries: IssueSummary[];

  constructor(eventRepository: RiskEventRepository, patternRepository: PatternRepository) {
    const enterprise = patternRepository.getEnterpriseBaseline();
    const allEvents = eventRepository.getAll();
    const eventsByIssue = groupBy(allEvents, (e) => e.issue);

    const globalLastMonth = allEvents.reduce(
      (max, e) => (e.timeline.occurrence_month > max ? e.timeline.occurrence_month : max),
      allEvents[0]?.timeline.occurrence_month ?? "",
    );

    const profiles: IssueProfile[] = [];
    for (const [issue, events] of eventsByIssue) {
      const relatedPatterns = patternRepository
        .getAll()
        .filter((p) => p.dimensions.issue === issue)
        .map(
          (p): RelatedPatternRef => ({
            pattern_id: p.pattern_id,
            title: p.title,
            priority_level: p.priority_level,
            high_rate_lift: p.observed.high_rate_lift,
          }),
        )
        .sort((a, b) => b.high_rate_lift - a.high_rate_lift);

      const profile = this.buildProfile(issue, events, enterprise, relatedPatterns, globalLastMonth);
      profiles.push(profile);
      this.profilesBySlug.set(profile.slug, profile);
    }

    this.rankedSummaries = rankProfiles(profiles);
  }

  /** The ranked "Issues Requiring Attention" list. */
  getRankedIssues(): IssuesListResponse {
    return {
      issues: this.rankedSummaries,
      count: this.rankedSummaries.length,
      totalIssues: this.rankedSummaries.length,
    };
  }

  getProfile(slug: string): IssueProfile | null {
    return this.profilesBySlug.get(slug) ?? null;
  }

  getDetail(slug: string, enterprise: EnterpriseBaseline): IssueDetailResponse | null {
    const profile = this.getProfile(slug);
    if (!profile) return null;
    return {
      profile,
      enterprise,
      graphFilter: { issue: [profile.issue] },
      deterministicSummary: buildDeterministicSummary(profile),
    };
  }

  // ---------- profile construction ----------

  private buildProfile(
    issue: string,
    events: RiskEvent[],
    enterprise: EnterpriseBaseline,
    relatedPatterns: RelatedPatternRef[],
    globalLastMonth: string,
  ): IssueProfile {
    const slug = slugify(issue);
    const severity = computeSeverity(events, enterprise);
    const openWorkload = computeOpenWorkload(events, enterprise);
    const financials = computeFinancials(events);
    const netExposureConcentration = computeNetExposureConcentration(events);
    const rootCauseBreakdown = computeRootCauseBreakdown(events, enterprise);
    const strongestRootCauseCombination = pickStrongestCombination(rootCauseBreakdown);
    const organisationBreakdown = computeOrganisationBreakdown(events);
    const ownerConcentration = computeWorkflowConcentration(events, (e) => e.workflow.owner_name);
    const assigneeConcentration = computeWorkflowConcentration(events, (e) => e.workflow.current_assignee);
    const timeliness = computeTimeliness(events, enterprise);
    const trend = computeTrend(events, globalLastMonth);
    const matchingEventIds = [...events.map((e) => e.event_id)].sort();

    const triggeredSignals = computeTriggeredSignals({
      severity,
      openWorkload,
      financials,
      netExposureConcentration,
      strongestRootCauseCombination,
      timeliness,
    });
    const rankScore = triggeredSignals.reduce((sum, s) => sum + s.weight, 0);

    return {
      issue,
      slug,
      severity,
      openWorkload,
      financials,
      netExposureConcentration,
      rootCauseBreakdown,
      strongestRootCauseCombination,
      organisationBreakdown,
      ownerConcentration,
      assigneeConcentration,
      timeliness,
      trend,
      matchingEventIds,
      relatedPatterns,
      triggeredSignals,
      rankScore,
    };
  }
}

// ---------- pure computation helpers ----------

function computeSeverity(events: RiskEvent[], enterprise: EnterpriseBaseline): IssueSeveritySummary {
  const severity: Record<string, number> = { Low: 0, Moderate: 0, High: 0 };
  for (const e of events) severity[e.classification] = (severity[e.classification] ?? 0) + 1;
  const highCount = severity["High"] ?? 0;
  const highRatePct = events.length > 0 ? round1((highCount / events.length) * 100) : 0;
  const highRateLift = enterprise.high_rate_pct > 0 ? round2(highRatePct / enterprise.high_rate_pct) : 0;
  return {
    event_count: events.length,
    severity,
    high_count: highCount,
    high_rate_pct: highRatePct,
    enterprise_high_rate_pct: enterprise.high_rate_pct,
    high_rate_lift: highRateLift,
  };
}

function computeOpenWorkload(events: RiskEvent[], enterprise: EnterpriseBaseline): IssueOpenWorkload {
  const openCount = events.filter((e) => e.workflow.is_open).length;
  return {
    open_events: openCount,
    open_rate_pct: events.length > 0 ? round1((openCount / events.length) * 100) : 0,
    enterprise_open_rate_pct: enterprise.open_rate_pct,
  };
}

function computeFinancials(events: RiskEvent[]): IssueFinancials {
  return {
    gross_amount: aggregateMoney(events, (e) => e.financial.gross_amount),
    net_amount: aggregateMoney(events, (e) => e.financial.net_amount_for_analysis),
    recovery_amount: aggregateMoney(events, (e) => e.financial.recovery_amount_for_analysis),
    potential_impact: aggregateMoney(events, (e) => e.financial.potential_impact),
  };
}

function computeNetExposureConcentration(events: RiskEvent[]): NetExposureConcentration {
  const populated = events
    .filter((e) => e.financial.net_amount_for_analysis !== null)
    .map((e) => ({ id: e.event_id, net: e.financial.net_amount_for_analysis as number }));

  const totalNet = populated.reduce((sum, e) => sum + e.net, 0);
  const sorted = [...populated].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const top = sorted.slice(0, T.NET_EXPOSURE_TOP_N);
  const topSum = top.reduce((sum, e) => sum + e.net, 0);

  return {
    top_n: T.NET_EXPOSURE_TOP_N,
    top_event_ids: top.map((e) => e.id),
    top_share_pct: totalNet !== 0 ? round1((topSum / totalNet) * 100) : null,
    total_net_amount: populated.length > 0 ? round2(totalNet) : null,
    populated_count: populated.length,
  };
}

function computeRootCauseBreakdown(events: RiskEvent[], enterprise: EnterpriseBaseline): RootCauseBreakdownEntry[] {
  const groups = groupBy(events, (e) => e.risk.root_cause);
  const entries: RootCauseBreakdownEntry[] = [];
  for (const [rootCause, group] of groups) {
    const highCount = group.filter((e) => e.classification === "High").length;
    const highRatePct = round1((highCount / group.length) * 100);
    const highRateLift = enterprise.high_rate_pct > 0 ? round2(highRatePct / enterprise.high_rate_pct) : 0;
    entries.push({
      root_cause: rootCause,
      event_count: group.length,
      high_count: highCount,
      high_rate_pct: highRatePct,
      high_rate_lift: highRateLift,
      meets_support_threshold: group.length >= T.ROOT_CAUSE_COMBO_MIN_SUPPORT,
    });
  }
  return entries.sort((a, b) => b.event_count - a.event_count || a.root_cause.localeCompare(b.root_cause));
}

function pickStrongestCombination(entries: RootCauseBreakdownEntry[]): RootCauseBreakdownEntry | null {
  const eligible = entries.filter((e) => e.meets_support_threshold);
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort(
    (a, b) => b.high_rate_lift - a.high_rate_lift || b.event_count - a.event_count || a.root_cause.localeCompare(b.root_cause),
  );
  return sorted[0] ?? null;
}

function computeOrganisationBreakdown(events: RiskEvent[]): OrganisationBreakdownEntry[] {
  const groups = groupBy(events, (e) => e.workflow.owner_organisation_short);
  const entries: OrganisationBreakdownEntry[] = [];
  for (const [org, group] of groups) {
    const highCount = group.filter((e) => e.classification === "High").length;
    entries.push({
      organisation: org,
      event_count: group.length,
      high_count: highCount,
      high_rate_pct: round1((highCount / group.length) * 100),
      small_sample: highCount < T.ORG_HIGH_RATE_SMALL_SAMPLE_MAX_HIGH_COUNT,
    });
  }
  return entries.sort((a, b) => b.high_rate_pct - a.high_rate_pct || a.organisation.localeCompare(b.organisation));
}

function computeWorkflowConcentration(events: RiskEvent[], nameOf: (e: RiskEvent) => string): WorkflowConcentrationEntry[] {
  const groups = groupBy(events, nameOf);
  const total = events.length;
  const entries: WorkflowConcentrationEntry[] = [...groups.entries()].map(([name, group]) => ({
    name,
    event_count: group.length,
    share_pct: total > 0 ? round1((group.length / total) * 100) : 0,
  }));
  return entries
    .sort((a, b) => b.event_count - a.event_count || a.name.localeCompare(b.name))
    .slice(0, T.WORKFLOW_CONCENTRATION_TOP_N);
}

function timelinessMetric(values: Array<number | null>, enterpriseMean: number): TimelinessMetric {
  const meanDays = meanNullable(values);
  return {
    mean_days: meanDays === null ? null : round2(meanDays),
    median_days: medianNullable(values),
    enterprise_mean_days: enterpriseMean,
    delta_days: meanDays === null ? null : round2(meanDays - enterpriseMean),
  };
}

function computeTimeliness(events: RiskEvent[], enterprise: EnterpriseBaseline): IssueTimeliness {
  return {
    detection_delay: timelinessMetric(
      events.map((e) => e.timeline.detection_delay_days),
      enterprise.detection_delay_mean_days,
    ),
    recording_delay: timelinessMetric(
      events.map((e) => e.timeline.recording_delay_days),
      enterprise.recording_delay_mean_days,
    ),
    occurrence_to_record: timelinessMetric(
      events.map((e) => e.timeline.occurrence_to_record_days),
      enterprise.occurrence_to_record_mean_days,
    ),
  };
}

/**
 * Recent-vs-prior trend over two equal-length, complete-month windows
 * anchored to the dataset's own last complete occurrence month
 * (`globalLastMonth`) rather than wall-clock "today" or a fixed calendar
 * boundary — see the threshold-file comment on `TREND_WINDOW_MONTHS` for why
 * that matters (it's what keeps the dataset's partial trailing period from
 * manufacturing a fake trend).
 */
function computeTrend(events: RiskEvent[], globalLastMonth: string): IssueTrend {
  const windowMonths = T.TREND_WINDOW_MONTHS;
  const recentStart = shiftMonth(globalLastMonth, -(windowMonths - 1));
  const priorEnd = shiftMonth(recentStart, -1);
  const priorStart = shiftMonth(priorEnd, -(windowMonths - 1));

  const recentCount = events.filter((e) => inMonthRange(e.timeline.occurrence_month, recentStart, globalLastMonth)).length;
  const priorCount = events.filter((e) => inMonthRange(e.timeline.occurrence_month, priorStart, priorEnd)).length;

  const percentChange = priorCount > 0 ? round1(((recentCount - priorCount) / priorCount) * 100) : null;
  const materialChange =
    percentChange !== null &&
    Math.abs(percentChange) >= T.TREND_MATERIAL_CHANGE_MIN_ABS_PCT &&
    priorCount >= T.TREND_MATERIAL_CHANGE_MIN_WINDOW_COUNT;

  const note = materialChange
    ? `${percentChange! >= 0 ? "Rising" : "Falling"}: ${recentCount} events in the last ${windowMonths} complete months vs ${priorCount} in the prior ${windowMonths} (${percentChange! >= 0 ? "+" : ""}${percentChange}%).`
    : `No material change: ${recentCount} events in the last ${windowMonths} complete months vs ${priorCount} in the prior ${windowMonths} — within normal variation for this sample size.`;

  return {
    recent: { start_month: recentStart, end_month: globalLastMonth, event_count: recentCount },
    prior: { start_month: priorStart, end_month: priorEnd, event_count: priorCount },
    percent_change: percentChange,
    material_change: materialChange,
    note,
  };
}

interface SignalInputs {
  severity: IssueSeveritySummary;
  openWorkload: IssueOpenWorkload;
  financials: IssueFinancials;
  netExposureConcentration: NetExposureConcentration;
  strongestRootCauseCombination: RootCauseBreakdownEntry | null;
  timeliness: IssueTimeliness;
}

function triggeredSignal(id: SignalId, detail: string): TriggeredSignal {
  return { id, label: SIGNAL_LABELS[id], detail, weight: SIGNAL_WEIGHTS[id] };
}

function computeTriggeredSignals(inputs: SignalInputs): TriggeredSignal[] {
  const signals: TriggeredSignal[] = [];
  const { severity, openWorkload, financials, netExposureConcentration, strongestRootCauseCombination, timeliness } = inputs;

  if (severity.high_rate_lift >= T.HIGH_RATE_LIFT_MIN) {
    signals.push(
      triggeredSignal(
        "HIGH_SEVERITY_CONCENTRATION",
        `${severity.high_rate_pct}% of events are High-severity vs ${severity.enterprise_high_rate_pct}% enterprise-wide (${severity.high_rate_lift}x).`,
      ),
    );
  }

  if (strongestRootCauseCombination && strongestRootCauseCombination.high_rate_lift >= T.ROOT_CAUSE_COMBO_LIFT_MIN) {
    const c = strongestRootCauseCombination;
    signals.push(
      triggeredSignal(
        "STRONG_ROOT_CAUSE_INTERACTION",
        `Combined with "${c.root_cause}" (${c.event_count} events, ${c.high_count} High), the High rate is ${c.high_rate_pct}% — ${c.high_rate_lift}x the enterprise baseline.`,
      ),
    );
  }

  if (financials.potential_impact.total !== null && financials.potential_impact.total >= T.POTENTIAL_IMPACT_MIN_USD) {
    signals.push(
      triggeredSignal(
        "POTENTIAL_IMPACT",
        `Total potential impact is $${financials.potential_impact.total.toLocaleString("en-US", { maximumFractionDigits: 0 })} across ${financials.potential_impact.populated_count} events.`,
      ),
    );
  }

  if (netExposureConcentration.top_share_pct !== null && netExposureConcentration.top_share_pct >= T.NET_EXPOSURE_CONCENTRATION_MIN_PCT) {
    signals.push(
      triggeredSignal(
        "NET_EXPOSURE_CONCENTRATION",
        `The top ${netExposureConcentration.top_n} events by net exposure account for ${netExposureConcentration.top_share_pct}% of this issue's total net amount.`,
      ),
    );
  }

  if (openWorkload.open_rate_pct >= T.OPEN_RATE_MIN_PCT) {
    signals.push(
      triggeredSignal(
        "OPEN_WORKLOAD",
        `${openWorkload.open_rate_pct}% of events remain open vs ${openWorkload.enterprise_open_rate_pct}% enterprise-wide.`,
      ),
    );
  }

  if (timeliness.detection_delay.mean_days !== null && timeliness.detection_delay.mean_days >= T.DETECTION_DELAY_MEAN_MIN_DAYS) {
    signals.push(
      triggeredSignal(
        "SLOW_DETECTION",
        `Mean detection delay is ${timeliness.detection_delay.mean_days}d vs ${timeliness.detection_delay.enterprise_mean_days}d enterprise-wide.`,
      ),
    );
  }

  if (timeliness.recording_delay.mean_days !== null && timeliness.recording_delay.mean_days >= T.RECORDING_DELAY_MEAN_MIN_DAYS) {
    signals.push(
      triggeredSignal(
        "SLOW_RECORDING",
        `Mean recording delay is ${timeliness.recording_delay.mean_days}d vs ${timeliness.recording_delay.enterprise_mean_days}d enterprise-wide.`,
      ),
    );
  }

  if (
    timeliness.occurrence_to_record.mean_days !== null &&
    timeliness.occurrence_to_record.mean_days >= T.OCCURRENCE_TO_RECORD_MEAN_MIN_DAYS
  ) {
    signals.push(
      triggeredSignal(
        "LONG_EVENT_JOURNEY",
        `Mean occurrence-to-record time is ${timeliness.occurrence_to_record.mean_days}d vs ${timeliness.occurrence_to_record.enterprise_mean_days}d enterprise-wide.`,
      ),
    );
  }

  return signals;
}

/**
 * Deterministic, stable ordering: rank score (sum of triggered-signal
 * weights) descending, then total potential impact descending (nulls last)
 * as the first tie-break, then issue name ascending as the final,
 * always-distinct tie-break — so two runs over the same data always produce
 * the same order.
 */
function rankProfiles(profiles: IssueProfile[]): IssueSummary[] {
  const sorted = [...profiles].sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    const aImpact = a.financials.potential_impact.total ?? -Infinity;
    const bImpact = b.financials.potential_impact.total ?? -Infinity;
    if (bImpact !== aImpact) return bImpact - aImpact;
    return a.issue.localeCompare(b.issue);
  });

  return sorted.map(
    (profile, index): IssueSummary => ({
      issue: profile.issue,
      slug: profile.slug,
      rank: index + 1,
      rankScore: profile.rankScore,
      triggeredSignals: profile.triggeredSignals,
      headline: {
        event_count: profile.severity.event_count,
        high_rate_pct: profile.severity.high_rate_pct,
        high_rate_lift: profile.severity.high_rate_lift,
        potential_impact: profile.financials.potential_impact.total,
        open_events: profile.openWorkload.open_events,
        open_rate_pct: profile.openWorkload.open_rate_pct,
        strongestRootCauseCombination: profile.strongestRootCauseCombination,
      },
    }),
  );
}

/** The facts-only paragraph shown for both the deterministic panel and the AI panel's recap — no Groq call involved. */
export function buildDeterministicSummary(profile: IssueProfile): string {
  const s = profile.severity;
  const sentences = [
    `${s.event_count} events are recorded under "${profile.issue}".`,
    `${s.high_count} ${s.high_count === 1 ? "is" : "are"} High-classified (${s.high_rate_pct}% vs ${s.enterprise_high_rate_pct}% enterprise-wide, ${s.high_rate_lift}x).`,
    `${profile.openWorkload.open_events} of ${s.event_count} matching events ${profile.openWorkload.open_events === 1 ? "is" : "are"} open.`,
    profile.strongestRootCauseCombination
      ? `The strongest root-cause interaction is with "${profile.strongestRootCauseCombination.root_cause}" (${profile.strongestRootCauseCombination.high_rate_lift}x enterprise High rate).`
      : "No root-cause combination for this issue clears the minimum support threshold for a reliable lift estimate.",
    profile.trend.note,
  ];
  return sentences.join(" ");
}

/** The trimmed, already-verified subset of an issue's profile handed to Groq — mirrors `buildObservedFacts`/`groq_fact_payload` for patterns. */
export function buildIssueEvidencePayload(profile: IssueProfile): IssueEvidencePayload {
  return {
    issue: profile.issue,
    triggered_signals: profile.triggeredSignals.map((s) => ({ id: s.id, label: s.label, detail: s.detail })),
    severity: profile.severity,
    openWorkload: profile.openWorkload,
    financials: profile.financials,
    netExposureConcentration: profile.netExposureConcentration,
    rootCauseBreakdown: profile.rootCauseBreakdown,
    strongestRootCauseCombination: profile.strongestRootCauseCombination,
    organisationBreakdown: profile.organisationBreakdown,
    ownerConcentration: profile.ownerConcentration,
    assigneeConcentration: profile.assigneeConcentration,
    timeliness: profile.timeliness,
    trend: profile.trend,
    matching_event_ids: profile.matchingEventIds,
    related_patterns: profile.relatedPatterns,
  };
}
