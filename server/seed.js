require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'admin123';

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  console.log(`User "${username}" already exists — skipping.`);
} else {
  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(id, username, hash);
  console.log(`Created admin user "${username}". Change ADMIN_PASSWORD in .env before going live.`);
}
