const bcrypt = require('bcryptjs');
const { client, ensureSchema } = require('../../lib/db');
const { signToken } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  await ensureSchema();

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const result = await client.execute({
    sql: 'SELECT * FROM users WHERE username = ?',
    args: [username],
  });
  const user = result.rows[0];

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const token = signToken({ id: user.id, username: user.username });
  res.json({ token, user: { username: user.username } });
};
