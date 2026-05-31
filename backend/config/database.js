/**
 * Database abstraction layer.
 * Supports both PostgreSQL (production) and SQLite (zero-setup dev).
 * Toggle via DB_DRIVER env var ("postgres" | "sqlite").
 *
 * Exposes a unified async query(sql, params) -> { rows } interface.
 * SQL is written in Postgres dialect with $1,$2 placeholders; SQLite
 * mode auto-translates placeholders to ? and a small set of common
 * functions (NOW() -> CURRENT_TIMESTAMP, SERIAL -> INTEGER AUTOINCREMENT).
 *
 * RETURNING clause handling for SQLite:
 *   - Any RETURNING <cols>  is stripped from the SQL
 *   - For INSERT, we refetch the row by lastInsertRowid using the captured
 *     column list (or * if none). For UPDATE / DELETE, RETURNING is dropped
 *     and an empty rows array is returned (avoid relying on it on UPDATE/DELETE).
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

let adapter;

if (DRIVER === 'postgres') {
  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'laborstay',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
  });

  adapter = {
    driver: 'postgres',
    async query(text, params = []) {
      const result = await pool.query(text, params);
      return { rows: result.rows, rowCount: result.rowCount };
    },
    async close() { await pool.end(); },
    raw: pool,
  };
} else {
  const Database = require('better-sqlite3');
  const sqlitePath = process.env.SQLITE_PATH || './data/laborstay.sqlite';
  const fullPath = path.isAbsolute(sqlitePath)
    ? sqlitePath
    : path.join(__dirname, '..', sqlitePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const db = new Database(fullPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Postgres → SQLite syntax shims (placeholders, literals, NOW()).
  // RETURNING is handled separately (we need to capture column list).
  function basicTranslate(sql) {
    return sql
      .replace(/\$(\d+)/g, '?')
      .replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP')
      .replace(/\bTRUE\b/g, '1')
      .replace(/\bFALSE\b/g, '0');
  }

  // Strip and capture trailing RETURNING <cols-or-*>. Returns { sql, returningCols }.
  // returningCols is null if no RETURNING clause; '*' for star; or a string
  // of comma-separated cols (used verbatim for the refetch SELECT).
  function extractReturning(sql) {
    const re = /\s+RETURNING\s+([^;]+?)\s*;?\s*$/i;
    const m = sql.match(re);
    if (!m) return { sql, returningCols: null };
    return {
      sql: sql.replace(re, ''),
      returningCols: m[1].trim(),
    };
  }

  adapter = {
    driver: 'sqlite',
    async query(text, params = []) {
      let sql = basicTranslate(text);
      const { sql: sqlNoReturning, returningCols } = extractReturning(sql);
      sql = sqlNoReturning;

      const trimmed = sql.trim().toUpperCase();
      try {
        if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('PRAGMA')) {
          const stmt = db.prepare(sql);
          const rows = stmt.all(...params);
          return { rows, rowCount: rows.length };
        }

        const stmt = db.prepare(sql);
        const info = stmt.run(...params);

        // INSERT — if RETURNING was requested OR by convention we want
        // the inserted row, refetch by lastInsertRowid.
        if (trimmed.startsWith('INSERT')) {
          const tableMatch = sql.match(/INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
          if (tableMatch && info.lastInsertRowid) {
            const cols = returningCols || '*';
            try {
              const row = db
                .prepare(`SELECT ${cols} FROM ${tableMatch[1]} WHERE rowid = ?`)
                .get(info.lastInsertRowid);
              return {
                rows: row ? [row] : [],
                rowCount: info.changes,
                lastID: info.lastInsertRowid,
              };
            } catch (e) {
              // Refetch failed (e.g. exotic column expression) — fall through.
              return { rows: [], rowCount: info.changes, lastID: info.lastInsertRowid };
            }
          }
          return { rows: [], rowCount: info.changes, lastID: info.lastInsertRowid };
        }

        // UPDATE / DELETE / etc. — RETURNING is dropped silently.
        return { rows: [], rowCount: info.changes };
      } catch (err) {
        err.sql = sql;
        throw err;
      }
    },
    async close() { db.close(); },
    raw: db,
  };
}

module.exports = adapter;
