export type SampleRow = { date: string; revenue: number; region: string; customer: string };
export type SampleSource = { rows: SampleRow[]; columnCount: number; completeness: number };

export function parseCsv(text: string, limit = 5000): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index++; }
      else if (quoted || !value) quoted = !quoted;
      else throw new Error("A CSV quote is invalid.");
    } else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(value); if (row.some(cell => cell.trim())) rows.push(row);
      row = []; value = "";
      if (rows.length > limit + 1) throw new Error(`Use a CSV with at most ${limit.toLocaleString()} rows in this preview.`);
    } else value += char;
  }
  if (quoted) throw new Error("A quoted CSV value was not closed.");
  row.push(value); if (row.some(cell => cell.trim())) rows.push(row);
  if (rows.length > limit + 1) throw new Error(`Use a CSV with at most ${limit.toLocaleString()} rows in this preview.`);
  return rows;
}

export function parseSalesSource(csv: string): SampleSource {
  const [header, ...records] = parseCsv(csv);
  if (!header || !records.length) throw new Error("The CSV needs a header and at least one data row.");
  if (header.length > 50 || records.some(row => row.length !== header.length)) throw new Error("The CSV rows must match the header, with at most 50 columns.");
  const names = header.map(value => value.trim().toLowerCase());
  const position = (choices: string[]) => names.findIndex(name => choices.includes(name));
  const date = position(["sale_date", "order_date", "date"]), revenue = position(["revenue_usd", "revenue", "sales_amount"]);
  const region = position(["region", "territory"]), customer = position(["customer_id", "customer"]);
  if ([date, revenue, region, customer].some(index => index < 0)) throw new Error("Use a sales CSV with sale_date, revenue_usd, region, and customer_id columns.");
  const rows = records.map((values, index) => {
    const day = values[date].trim(), amount = Number(values[revenue]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new Error(`Row ${index + 2} needs an ISO date such as 2026-01-25.`);
    if (!values[revenue].trim() || !Number.isFinite(amount)) throw new Error(`Row ${index + 2} needs a numeric revenue value.`);
    if (!values[region].trim() || !values[customer].trim()) throw new Error(`Row ${index + 2} needs a region and customer ID.`);
    return { date: day, revenue: amount, region: values[region].trim(), customer: values[customer].trim() };
  });
  const missing = records.reduce((sum, values) => sum + values.filter(value => !value.trim()).length, 0);
  return { rows, columnCount: header.length, completeness: (1 - missing / (records.length * header.length)) * 100 };
}

export function salesCsv(rows: SampleRow[]) {
  const cell = (value: string | number) => {
    const safe = typeof value === "string" && /^[=+@\-\t\r]/.test(value) ? `'${value}` : String(value);
    return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return ["sale_date,revenue_usd,region,customer_id", ...rows.map(row => [row.date, row.revenue, row.region, row.customer].map(cell).join(","))].join("\n");
}
