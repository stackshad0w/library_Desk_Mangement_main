// Migrates existing localStorage data (exported from the old HTML file, or
// from the v20 SQLite build) into Turso. If Cloudinary credentials are set,
// any data:image/... strings found inside the data are uploaded and swapped
// for their hosted URL, same as the live app does going forward — so a
// migrated database ends up with no giant base64 blobs in it.
//
// How to export your data from the old HTML file:
//   1. Open the old file in your browser.
//   2. DevTools console (F12) and run:  copy(JSON.stringify(localStorage))
//   3. Paste the copied text into data/legacy_localstorage.json
//   4. Run: node scripts/migrate.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { client, ensureSchema } = require('../lib/db');
const cloudinary = require('../lib/cloudinary');

const filePath = process.argv[2] || path.join(__dirname, '..', 'data', 'legacy_localstorage.json');

async function offloadImages(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (e) {
    return value; // not JSON, leave as-is (e.g. theme = "dark")
  }

  let changed = false;

  async function walk(node) {
    if (typeof node === 'string' && node.startsWith('data:image')) {
      try {
        const url = await cloudinary.uploadDataUrl(node);
        changed = true;
        return url;
      } catch (err) {
        console.warn('  ! image upload failed, keeping inline:', err.message);
        return node;
      }
    }
    if (Array.isArray(node)) return Promise.all(node.map(walk));
    if (node && typeof node === 'object') {
      const out = {};
      for (const k of Object.keys(node)) out[k] = await walk(node[k]);
      return out;
    }
    return node;
  }

  const result = await walk(parsed);
  return changed ? JSON.stringify(result) : value;
}

async function main() {
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

  await ensureSchema();

  const offload = cloudinary.configured();
  if (!offload) {
    console.log('Cloudinary not configured — photos will be migrated as inline base64 (set CLOUDINARY_* env vars to offload them).');
  }

  let count = 0;
  for (const [key, rawValue] of Object.entries(data)) {
    const value = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
    const finalValue = offload ? await offloadImages(value) : value;

    await client.execute({
      sql: `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      args: [key, finalValue],
    });
    count++;
    console.log(`  migrated ${key}`);
  }

  console.log(`Migrated ${count} keys into Turso.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
