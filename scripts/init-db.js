require('dotenv').config();

const { readFile } = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');

const initialSupportUser = {
  name: process.env.ADMIN_NAME || 'Jhonny Cala',
  email: process.env.ADMIN_EMAIL || 'jcala2@cuc.edu.co',
};
const expectedTables = ['users', 'tickets', 'tasks', 'messages'];
const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');

async function initializeDatabase() {
  if (process.env.ADMIN_ROLE && process.env.ADMIN_ROLE !== 'support') {
    throw new Error('ADMIN_ROLE must be support for the initial account.');
  }

  const schema = await readFile(schemaPath, 'utf8');
  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    await client.query(schema);

    const existingUser = await client.query(
      'SELECT id, role FROM users WHERE email = $1',
      [initialSupportUser.email],
    );

    let supportUserAction;
    if (existingUser.rowCount > 0) {
      if (existingUser.rows[0].role !== 'support') {
        throw new Error(
          'The initial support email already belongs to a non-support user; no account was changed.',
        );
      }
      supportUserAction = 'reused';
    } else {
      const password = process.env.ADMIN_PASSWORD;
      if (!password) {
        throw new Error(
          'ADMIN_PASSWORD must be set in backend/.env to create the initial support user.',
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'support')`,
        [initialSupportUser.name, initialSupportUser.email, passwordHash],
      );
      supportUserAction = 'created';
    }

    const tableResult = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [expectedTables],
    );
    const foundTables = tableResult.rows.map((row) => row.table_name);
    const missingTables = expectedTables.filter(
      (tableName) => !foundTables.includes(tableName),
    );
    if (missingTables.length > 0) {
      throw new Error(`Schema verification failed; missing tables: ${missingTables.join(', ')}.`);
    }

    await client.query('COMMIT');
    transactionStarted = false;

    console.log('Database initialization completed.');
    console.log(`Tables verified: ${foundTables.join(', ')}.`);
    console.log(`Initial support user: ${supportUserAction}.`);
  } catch (error) {
    if (client && transactionStarted) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

initializeDatabase().catch((error) => {
  console.error(`Database initialization failed: ${error.message}`);
  process.exitCode = 1;
});
