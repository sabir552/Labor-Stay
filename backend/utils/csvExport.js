/**
 * CSV export helper (I4).
 *
 * Tries to use `json2csv` if available; falls back to a minimal built-in
 * CSV writer so the endpoint never crashes when the package isn't installed.
 *
 * sendCsv(res, rows, opts?)  — pipes the result to an Express response.
 */

let parser = null;
try { parser = require('json2csv'); } catch (e) { /* fallback below */ }

function escapeCsvCell(v) {
  if (v == null) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCsv(rows, fields) {
  if (!rows || !rows.length) return (fields || []).join(',') + '\n';
  const cols = fields || Object.keys(rows[0]);
  const header = cols.map(escapeCsvCell).join(',');
  const body = rows.map((r) => cols.map((c) => escapeCsvCell(r[c])).join(',')).join('\n');
  return header + '\n' + body + '\n';
}

function toCsv(rows, opts = {}) {
  // Empty result + no explicit fields → return a one-line "no_data" header
  // so the CSV file is never zero-bytes (curl/Excel handle it cleanly).
  if ((!rows || rows.length === 0) && !opts.fields) {
    return 'no_data\n';
  }
  if (parser && parser.Parser) {
    try {
      const p = new parser.Parser({ fields: opts.fields });
      return p.parse(rows);
    } catch (e) {
      return rowsToCsv(rows, opts.fields);
    }
  }
  return rowsToCsv(rows, opts.fields);
}

function sendCsv(res, rows, opts = {}) {
  const filename = (opts.filename || 'export') + '.csv';
  const csv = toCsv(rows, opts);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

module.exports = { toCsv, sendCsv };
