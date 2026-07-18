const express = require('express');
const { db } = require('./db');

const router = express.Router();

// Return every stored key/value pair as a flat object, e.g.
// { "edu_students": "[...]", "edutrack-theme": "dark", ... }
// This is loaded once on app boot and written straight into localStorage.
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM kv').all();
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  res.json(out);
});

// Upsert a single key. Mirrors localStorage.setItem(key, value).
router.put('/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body || {};
  if (typeof value !== 'string') {
    return res.status(400).json({ message: 'value must be a string (JSON.stringify it client-side, same as localStorage)' });
  }
  db.prepare(`
    INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
  res.json({ ok: true });
});

// Mirrors localStorage.removeItem(key).
router.delete('/:key', (req, res) => {
  const { key } = req.params;
  db.prepare('DELETE FROM kv WHERE key = ?').run(key);
  res.json({ ok: true });
});

module.exports = router;
