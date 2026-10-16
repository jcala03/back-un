const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Set it in backend/.env.');
}

let databaseHost;
try {
  databaseHost = new URL(databaseUrl).hostname;
} catch {
  throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
}

const usesRenderDatabase = databaseHost.endsWith('.render.com');
const useSsl = usesRenderDatabase || process.env.DATABASE_SSL === 'true';

const pool = new Pool({
  connectionString: databaseUrl,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

module.exports = { pool };
