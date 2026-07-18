const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function signToken(user) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Returns the decoded payload, or null if missing/invalid/expired.
function verifyRequest(req) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set');
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Call at the top of any protected handler. Sends 401 and returns null if
// unauthenticated; otherwise returns the decoded token payload.
function requireAuth(req, res) {
  const user = verifyRequest(req);
  if (!user) {
    res.status(401).json({ message: 'Missing or invalid token' });
    return null;
  }
  return user;
}

module.exports = { signToken, verifyRequest, requireAuth };
