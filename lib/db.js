const { createClient } = require('@libsql/client');

// In production (Vercel) set:
//   TURSO_DATABASE_URL = libsql://<your-db>-<org>.turso.io
//   TURSO_AUTH_TOKEN   = <token from `turso db tokens create`>
// For local dev without a Turso account, this falls back to a local
// file-based libSQL database (SQLite-compatible), so `vercel dev` works
// out of the box with zero cloud setup.
const url = process.env.TURSO_DATABASE_URL || `file:${__dirname}/../data/app.db`;
const authToken = process.env.TURSO_AUTH_TOKEN; // not needed for file: URLs

const client = createClient(authToken ? { url, authToken } : { url });

let initialized = null;

// Lazily creates tables on first use. Safe to call on every cold start —
// CREATE TABLE IF NOT EXISTS is idempotent, and we cache the promise so
// warm invocations don't re-run it.
async function ensureSchema() {
  if (!initialized) {
    initialized = client.batch(
      [
        `CREATE TABLE IF NOT EXISTS users (
           id TEXT PRIMARY KEY,
           username TEXT UNIQUE NOT NULL,
           password_hash TEXT NOT NULL,
           created_at TEXT DEFAULT (datetime('now'))
         )`,
        `CREATE TABLE IF NOT EXISTS kv (
           key TEXT PRIMARY KEY,
           value TEXT NOT NULL,
           updated_at TEXT DEFAULT (datetime('now'))
         )`,
      ],
      'write'
    );
  }
  return initialized;
}

module.exports = { client, ensureSchema };
