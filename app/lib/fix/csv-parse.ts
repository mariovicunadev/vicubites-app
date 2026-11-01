export interface CsvRow {
  /** 1-based line where the row starts, as a spreadsheet numbers it. */
  line: number;
  cells: string[];
}

/**
 * RFC 4180 parser for spreadsheets saved as CSV: quoted fields with commas,
 * doubled quotes and line breaks; CRLF or LF; an optional UTF-8 BOM (Excel
 * adds one). Rows that are entirely empty are dropped.
 */
export function parseCsv(text: string): CsvRow[] {
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const endField = () => {
    cells.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (cells.some((value) => value !== "")) rows.push({ line: rowLine, cells });
    cells = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === "\n" || (char === "\r" && input[i + 1] !== "\n")) line += 1;

    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") continue;
      endRow();
      rowLine = line;
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("The CSV ends inside a quoted field.");
  if (field !== "" || cells.length > 0) endRow();
  return rows;
}

export interface CsvRecord {
  line: number;
  values: Readonly<Record<string, string>>;
}

/** Splits the header from the rows and keys each row by column name. */
export function csvRecords(text: string): { columns: string[]; records: CsvRecord[] } {
  const [header, ...rows] = parseCsv(text);
  const columns = (header?.cells ?? []).map((column) => column.trim());
  const records = rows.map(({ line, cells }) => ({
    line,
    values: Object.fromEntries(columns.map((column, i) => [column, (cells[i] ?? "").trim()])),
  }));
  return { columns, records };
}
