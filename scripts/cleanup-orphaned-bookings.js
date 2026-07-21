// One-time cleanup: finds seat bookings whose studentId no longer matches
// any existing student (because they were deleted before the seat-release
// fix existed) and marks those bookings 'cancelled' so the seat map shows
// them as vacant again.
//
// Safe to run more than once — it only touches bookings that are currently
// 'active' AND point at a student that no longer exists.
//
// Usage:
//   node scripts/cleanup-orphaned-bookings.js          (dry run, shows what would change)
//   node scripts/cleanup-orphaned-bookings.js --apply  (actually applies the fix)
require('dotenv').config();
const { client, ensureSchema } = require('../lib/db');

async function main() {
  const apply = process.argv.includes('--apply');

  await ensureSchema();

  const studentsRow = await client.execute({ sql: 'SELECT value FROM kv WHERE key = ?', args: ['edu_students'] });
  const bookingsRow = await client.execute({ sql: 'SELECT value FROM kv WHERE key = ?', args: ['blib_bookings'] });

  if (!bookingsRow.rows.length) {
    console.log('No blib_bookings key found — nothing to clean up.');
    return;
  }

  const students = studentsRow.rows.length ? JSON.parse(studentsRow.rows[0].value) : [];
  const studentIds = new Set(students.map((s) => s.id));
  const bookings = JSON.parse(bookingsRow.rows[0].value);

  let orphanCount = 0;
  const updated = bookings.map((b) => {
    if (b.status === 'active' && !studentIds.has(b.studentId)) {
      orphanCount++;
      console.log(`  Seat #${b.seat} — orphaned booking for deleted student "${b.studentName}" (${b.studentId})`);
      return { ...b, status: 'cancelled' };
    }
    return b;
  });

  if (orphanCount === 0) {
    console.log('No orphaned bookings found. Nothing to fix.');
    return;
  }

  console.log(`\nFound ${orphanCount} orphaned booking(s).`);

  if (!apply) {
    console.log('\nDry run only — no changes made. Re-run with --apply to actually fix these.');
    return;
  }

  await client.execute({
    sql: `UPDATE kv SET value = ?, updated_at = datetime('now') WHERE key = 'blib_bookings'`,
    args: [JSON.stringify(updated)],
  });

  console.log(`Done — ${orphanCount} seat(s) released.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
