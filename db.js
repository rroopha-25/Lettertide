// Storage. In production, letters live in a free hosted Turso database (DATABASE_URL + DATABASE_TOKEN),
// so nothing is lost when a free web server restarts. Locally and in tests, a plain SQLite file is used.
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { createClient } = require('@libsql/client');

const remote = process.env.DATABASE_URL;
let url = remote;
if (!url) {
  const file = process.env.DB_PATH || path.join(__dirname, 'data', 'lettertide.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  url = 'file:' + file;
}
const client = createClient({ url, authToken: process.env.DATABASE_TOKEN });

const plain = (cols, row) => Object.fromEntries(cols.map(c => [c, row[c]]));
const exec = (sql, args) => client.execute({ sql, args: args.map(a => a === undefined ? null : a) });

const db = {
  mode: remote ? 'turso' : 'file',
  async get(sql, ...args) { const r = await exec(sql, args); return r.rows[0] ? plain(r.columns, r.rows[0]) : undefined; },
  async all(sql, ...args) { const r = await exec(sql, args); return r.rows.map(row => plain(r.columns, row)); },
  async run(sql, ...args) { const r = await exec(sql, args); return { changes: r.rowsAffected }; },
  async init() {
    await client.executeMultiple(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, backup_email TEXT,
  created INTEGER NOT NULL, last_confirmed INTEGER NOT NULL, checkin_sent INTEGER
);
CREATE TABLE IF NOT EXISTS login_tokens (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS confirm_tokens (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mail (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('future','people','santa')),
  created INTEGER NOT NULL,
  deliver INTEGER NOT NULL,
  data TEXT NOT NULL,
  recipient_email TEXT,
  delivered_at INTEGER,
  opened INTEGER
);
CREATE INDEX IF NOT EXISTS mail_due ON mail(deliver) WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS mail_user ON mail(user_id);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
`);
  }
};

module.exports = db;
