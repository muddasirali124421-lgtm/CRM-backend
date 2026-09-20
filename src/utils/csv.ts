/**
 * CSV Generation Utility
 * RFC 4180 compliant CSV formatting with CSV Formula Injection mitigation.
 */

/**
 * Sanitizes a single cell value for CSV output.
 * Mitigates CSV formula injection vulnerability by prepending a single quote
 * if cell value starts with sensitive formula trigger characters (=, +, -, @, tab, newline).
 */
export function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  let str = String(val);

  // If value starts with formula trigger characters, neutralize it with a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // If value contains special characters (comma, double quote, carriage return, newline),
  // double up any quotes and wrap entire cell in double quotes.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Converts array of headers and data rows into a sanitized CSV string.
 */
export function generateCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(sanitizeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(sanitizeCsvCell).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}
