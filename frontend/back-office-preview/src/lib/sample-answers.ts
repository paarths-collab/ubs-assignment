import type { SampleSource } from "@/lib/sample-data";

export type SampleAnswer = { answer: string; method: string; values?: { label: string; value: string }[] };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);

export function answerSample(question: string, source: SampleSource, previous = ""): SampleAnswer {
  const text = question.toLowerCase(), rows = source.rows;
  const total = rows.reduce((sum, row) => sum + row.revenue, 0);
  const grouped = (field: "region" | "date") => [...rows.reduce((map, row) => { const key = field === "date" ? row.date.slice(0, 7) : row.region; map.set(key, (map.get(key) ?? 0) + row.revenue); return map; }, new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b));
  if (/missing|quality|complete|columns|rows|profile/.test(text)) return { answer: `${rows.length} records across ${source.columnCount} columns. ${source.completeness.toFixed(1)}% of source values are present.`, method: "Nonempty cells divided by all source cells; no values are filled or removed." };
  if (/customer|clients|buyers/.test(text)) return { answer: `There are ${new Set(rows.map(row => row.customer)).size} distinct customers across ${rows.length} transactions.`, method: "Count distinct customer IDs across the complete loaded source." };
  if (/month|trend|over time|by date/.test(text)) return { answer: `Recorded revenue totals ${money(total)} across ${grouped("date").length} months.`, values: grouped("date").map(([label, value]) => ({ label, value: money(value) })), method: "Sum revenue by calendar month from the sale date. No forecast or missing-date interpolation." };
  if (/region|territory|geograph/.test(text) || (/break.*down|compare/.test(text) && /region/.test(previous))) {
    const values = grouped("region").sort((a, b) => b[1] - a[1]);
    return { answer: `${values[0][0]} has the highest recorded revenue at ${money(values[0][1])}.`, values: values.map(([label, value]) => ({ label, value: money(value) })), method: "Sum the revenue field grouped by region across the loaded records." };
  }
  if (/average|mean/.test(text)) return { answer: `Average revenue per transaction is ${money(total / rows.length)}.`, method: "Sum revenue divided by the number of transaction records." };
  if (/highest|largest|biggest|maximum|outlier|unusual/.test(text)) {
    const maximum = rows.reduce((max, row) => row.revenue > max.revenue ? row : max, rows[0]);
    return { answer: `The largest transaction is ${money(maximum.revenue)} on ${maximum.date}, in ${maximum.region}. This identifies the maximum; it does not establish a statistical anomaly.`, method: "Compare the recorded revenue values and return the largest transaction." };
  }
  if (/revenue|sales|total|sum/.test(text)) return { answer: `Total recorded revenue is ${money(total)} across ${rows.length} transactions.`, method: "Sum the revenue field across all loaded source records." };
  return { answer: "Try revenue by region, monthly revenue, average transaction value, customer count, or data quality. This preview calculates those answers locally.", method: "No AI provider is called in this preview. The workspace supports the existing analysis flow." };
}

