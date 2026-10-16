const jwt = require('jsonwebtoken');
const asyncHandler = require('./async-handler');
const { pool } = require('../config/db');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required.');
  }
  return secret;
}

const requireAuth = asyncHandler(async (request, response, next) => {
  const authorization = request.get('authorization');
  const match = authorization && authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return response.status(401).json({ error: 'Authentication required.' });
  }

  let payload;
  const secret = getJwtSecret();
  try {
    payload = jwt.verify(match[1], secret);
  } catch {
    return response.status(401).json({ error: 'Invalid or expired token.' });
  }

  if (!payload || typeof payload !== 'object' || !Number.isInteger(payload.sub)) {
    return response.status(401).json({ error: 'Invalid or expired token.' });
  }

  const result = await pool.query(
    'SELECT id, name, email, role FROM users WHERE id = $1',
    [payload.sub],
  );
  if (result.rowCount === 0) {
    return response.status(401).json({ error: 'User no longer exists.' });
  }

  request.user = result.rows[0];
  return next();
});

module.exports = { requireAuth, getJwtSecret };
