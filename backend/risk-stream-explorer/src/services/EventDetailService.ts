import type { RawFullEventDetail } from "../types/Event";
import { EVENT_DETAIL_SECTIONS, type FieldFormat } from "../config/fieldRegistry";

export interface RenderedField {
  label: string;
  format: FieldFormat;
  value: string | number | null;
}

export interface RenderedSection {
  title: string;
  fields: RenderedField[];
}

/**
 * Projects the raw 35-field event detail record into the drawer's
 * collapsible-section shape via the field registry. Every original field is
 * carried through untouched — this is presentation grouping only, not a
 * recalculation of anything.
 */
export function renderEventDetailSections(detail: RawFullEventDetail): RenderedSection[] {
  return EVENT_DETAIL_SECTIONS.map((section) => ({
    title: section.title,
    fields: section.fields.map((field) => ({
      label: field.label,
      format: field.format,
      value: detail[field.key],
    })),
  }));
}
