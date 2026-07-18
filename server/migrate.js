// Migrates existing browser localStorage data into the backend.
//
// How to export your data from the old HTML file:
//   1. Open the old file in your browser.
//   2. Open DevTools console (F12) and run:
//        copy(JSON.stringify(localStorage))
//   3. Paste the copied text into data/legacy_localstorage.json
//   4. Run: npm run migrate
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const filePath = process.argv[2] || path.join(__dirname, '..', 'data', 'legacy_localstorage.json');

if (!fs.existsSync(filePath)) {
  console.error(`No file found at ${filePath}`);
  console.error('Export your old localStorage data first (see comment at top of this file), then re-run.');
  process.exit(1);
}

const raw = fs.readFileSync(filePath, 'utf-8');
let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error('File is not valid JSON:', err.message);
  process.exit(1);
}

const stmt = db.prepare(`
  INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
`);

let count = 0;
for (const [key, value] of Object.entries(data)) {
  stmt.run(key, typeof value === 'string' ? value : JSON.stringify(value));
  count++;
}

console.log(`Migrated ${count} keys into the database.`);
