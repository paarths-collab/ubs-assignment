import type { RawFullEventDetail } from "../types/Event.js";

export type FieldFormat =
  | "text"
  | "longtext"
  | "date-iso"
  | "date-dmy"
  | "currency-preformatted"
  | "days"
  | "severity-badge"
  | "eventtype-badge";

export interface FieldDefinition {
  key: keyof RawFullEventDetail;
  label: string;
  format: FieldFormat;
}

export interface FieldSection {
  title: string;
  fields: FieldDefinition[];
}

/**
 * Groups all 35 raw fields from event_details_streamgraph.json into the
 * collapsible sections shown in the event investigation drawer. Every key of
 * RawFullEventDetail must appear in exactly one section — enforced by
 * `assertFieldRegistryComplete` in validation.
 */
export const EVENT_DETAIL_SECTIONS: FieldSection[] = [
  {
    title: "Event Snapshot",
    fields: [
      { key: "Event ID", label: "Event ID", format: "text" },
      { key: "Event Title", label: "Event Title", format: "text" },
      { key: "Event Description", label: "Event Description", format: "longtext" },
      { key: "Event Type", label: "Event Type", format: "eventtype-badge" },
      { key: "Overall Event Classification", label: "Severity", format: "severity-badge" },
      { key: "Event Status", label: "Event Status", format: "text" },
      { key: "Event Stage", label: "Event Stage", format: "text" },
      { key: "Provision Status", label: "Provision Status", format: "text" },
      { key: "Event Occurrence Date", label: "Occurrence Date", format: "date-iso" },
      { key: "Date Event Discovered", label: "Date Discovered", format: "date-iso" },
    ],
  },
  {
    title: "Risk & Cause",
    fields: [
      { key: "Risk Theme", label: "Risk Theme", format: "text" },
      { key: "Root Cause", label: "Root Cause", format: "text" },
      { key: "OR Category", label: "OR Category", format: "text" },
      { key: "Impacts", label: "Impacts", format: "longtext" },
    ],
  },
  {
    title: "Financial Impact",
    fields: [
      { key: "Event Gross Amount (USD)", label: "Gross Amount", format: "currency-preformatted" },
      { key: "Event Net Amount (USD)", label: "Net Amount", format: "currency-preformatted" },
      { key: "Event Recovery Amount (USD)", label: "Recovery Amount", format: "currency-preformatted" },
      {
        key: "Event Potential Impact Amount  (USD)",
        label: "Potential Impact",
        format: "currency-preformatted",
      },
    ],
  },
  {
    title: "Ownership & Workflow",
    fields: [
      { key: "Event Owner Organisation", label: "Owner Organisation", format: "text" },
      { key: "Discovery Organisation", label: "Discovery Organisation", format: "text" },
      { key: "Event Owner Name", label: "Event Owner", format: "text" },
      { key: "Current Assignee", label: "Current Assignee", format: "text" },
      { key: "Event Creator Name", label: "Event Creator", format: "text" },
      { key: "Event Administrator Name", label: "Event Administrator", format: "text" },
    ],
  },
  {
    title: "Investigation Detail",
    fields: [
      { key: "Background Detail", label: "Background", format: "longtext" },
      { key: "Issue Detail", label: "Issue Detail", format: "longtext" },
      { key: "Root Cause Detail", label: "Root Cause Detail", format: "longtext" },
      { key: "Impact Detail", label: "Impact Detail", format: "longtext" },
      { key: "Opportunity", label: "Opportunity", format: "longtext" },
    ],
  },
  {
    title: "Timeliness",
    fields: [
      { key: "Detection Delay Days", label: "Detection Delay", format: "days" },
      { key: "Recording Delay Days", label: "Recording Delay", format: "days" },
      { key: "Occurrence to Record Days", label: "Occurrence to Record", format: "days" },
    ],
  },
  {
    title: "Audit Trail",
    fields: [
      { key: "Created On", label: "Created On", format: "date-iso" },
      { key: "Modified By Name", label: "Modified By", format: "text" },
      { key: "Modified On", label: "Modified On", format: "date-dmy" },
    ],
  },
];

export function assertFieldRegistryComplete(sampleKeys: string[]): void {
  const registered = new Set(
    EVENT_DETAIL_SECTIONS.flatMap((section) => section.fields.map((f) => f.key as string)),
  );
  const missing = sampleKeys.filter((k) => !registered.has(k));
  const extra = [...registered].filter((k) => !sampleKeys.includes(k));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Field registry out of sync with dataset. Missing: [${missing.join(", ")}]. Extra: [${extra.join(", ")}].`,
    );
  }
}
