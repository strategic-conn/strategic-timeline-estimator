import * as XLSX from "xlsx";

/** .xlsx is a zip ("PK"), .xls an OLE file — anything else isn't a real workbook. */
export function looksLikeWorkbook(bytes: Uint8Array, ext: string): boolean {
  const sig = ext === "xlsx" ? [0x50, 0x4b, 0x03, 0x04] : [0xd0, 0xcf, 0x11, 0xe0];
  return sig.every((b, i) => bytes[i] === b);
}

/** Every sheet as CSV under its name — formulas as their values, no blank rows. Throws if unreadable. */
export function spreadsheetText(bytes: Uint8Array): string {
  const book = XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false });
  return book.SheetNames.map((n) => {
    const csv = XLSX.utils.sheet_to_csv(book.Sheets[n], { blankrows: false }).trim();
    return csv ? `## Sheet: ${n}\n${csv}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}
