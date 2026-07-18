const { client, ensureSchema } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  await ensureSchema();

  const { key } = req.query;

  if (req.method === 'PUT') {
    const { value } = req.body || {};
    if (typeof value !== 'string') {
      return res.status(400).json({ message: 'value must be a string (JSON.stringify it client-side, same as localStorage)' });
    }
    await client.execute({
      sql: `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      args: [key, value],
    });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    await client.execute({ sql: 'DELETE FROM kv WHERE key = ?', args: [key] });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', 'PUT, DELETE');
  res.status(405).json({ message: 'Method not allowed' });
};
