const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middleware/async-handler');
const { getJwtSecret } = require('../middleware/auth.middleware');
const { pool } = require('../config/db');

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function createToken(user) {
  return jwt.sign(
    { sub: user.id },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
}

const register = asyncHandler(async (request, response) => {
  const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
  const email = typeof request.body?.email === 'string'
    ? request.body.email.trim().toLowerCase()
    : '';
  const password = request.body?.password;

  if (!name || !email || typeof password !== 'string') {
    return response.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (name.length > 120 || email.length > 150) {
    return response.status(422).json({ error: 'Name or email exceeds the maximum length.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(422).json({ error: 'A valid email address is required.' });
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return response.status(422).json({ error: 'Password must contain at least 8 characters and at most 72 UTF-8 bytes.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'client')
       RETURNING id, name, email, role, created_at, updated_at`,
      [name, email, passwordHash],
    );
    return response.status(201).json({ data: publicUser(result.rows[0]) });
  } catch (error) {
    if (error.code === '23505') {
      return response.status(409).json({ error: 'An account with this email already exists.' });
    }
    throw error;
  }
});

const login = asyncHandler(async (request, response) => {
  const email = typeof request.body?.email === 'string'
    ? request.body.email.trim().toLowerCase()
    : '';
  const password = request.body?.password;
  if (!email || typeof password !== 'string') {
    return response.status(400).json({ error: 'Email and password are required.' });
  }

  const result = await pool.query(
    'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
    [email],
  );
  const user = result.rows[0];
  const passwordMatches = user
    ? await bcrypt.compare(password, user.password_hash)
    : false;
  if (!passwordMatches) {
    return response.status(401).json({ error: 'Invalid email or password.' });
  }

  const safeUser = publicUser(user);
  return response.json({ data: { token: createToken(user), user: safeUser } });
});

const me = asyncHandler(async (request, response) => (
  response.json({ data: publicUser(request.user) })
));

module.exports = { register, login, me };
