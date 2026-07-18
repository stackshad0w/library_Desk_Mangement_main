require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { client, ensureSchema } = require('../lib/db');

async function main() {
  await ensureSchema();

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await client.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [username],
  });

  if (existing.rows.length) {
    console.log(`User "${username}" already exists — skipping.`);
    return;
  }

  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(password, 10);
  await client.execute({
    sql: 'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)',
    args: [id, username, hash],
  });
  console.log(`Created admin user "${username}". Change ADMIN_PASSWORD before going live.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
