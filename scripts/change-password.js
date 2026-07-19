// Changes the password for an existing user.
//
// Usage:
//   node scripts/change-password.js <username> <newPassword>
//
// Example:
//   node scripts/change-password.js admin MyNewSecurePass123
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { client, ensureSchema } = require('../lib/db');

async function main() {
  const [username, newPassword] = process.argv.slice(2);

  if (!username || !newPassword) {
    console.error('Usage: node scripts/change-password.js <username> <newPassword>');
    process.exit(1);
  }

  await ensureSchema();

  const existing = await client.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [username],
  });

  if (!existing.rows.length) {
    console.error(`No user found with username "${username}". Existing usernames:`);
    const all = await client.execute('SELECT username FROM users');
    all.rows.forEach((r) => console.error(`  - ${r.username}`));
    process.exit(1);
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  await client.execute({
    sql: 'UPDATE users SET password_hash = ? WHERE username = ?',
    args: [hash, username],
  });

  console.log(`Password updated for user "${username}".`);
  console.log('Any existing login sessions (JWTs) for this user stay valid until they expire naturally (see JWT_EXPIRES_IN) — this does not force-log-out other sessions.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
