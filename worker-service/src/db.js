import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

// Create pools per-region. Environment variables expected:
// PG_DATABASE_ASIA, PG_DATABASE_EU, PG_DATABASE_NA, PG_DATABASE_GLOBAL
function makePool(databaseName) {
  return new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST || 'localhost',
    database: databaseName,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    password: process.env.PGPASSWORD || undefined,
  });
}

const asia_pool = makePool(process.env.PG_DATABASE_ASIA || process.env.PGDATABASE);
const eu_pool = makePool(process.env.PG_DATABASE_EU || process.env.PGDATABASE);
const na_pool = makePool(process.env.PG_DATABASE_NA || process.env.PGDATABASE);
const global_pool = makePool(process.env.PG_DATABASE_GLOBAL || process.env.PGDATABASE);

const pools = {
  ASIA: asia_pool,
  EU: eu_pool,
  NA: na_pool,
  GLOBAL: global_pool,
};

Object.values(pools).forEach(p => p.on && p.on('connect', () => console.log('Connected to Postgres pool')));

// Create table and indexes if not exists on a given pool
async function ensureTableOnPool(pool) {
  const create = `
    CREATE TABLE IF NOT EXISTS leaderboard (
      user_id TEXT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      region VARCHAR(50) NOT NULL,
      score BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_leaderboard_name ON leaderboard(name);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_region_score ON leaderboard(region, score DESC);
  `;
  await pool.query(create);
}

// Ensure tables exist across all region pools
async function ensureTableExists() {
  for (const [k, p] of Object.entries(pools)) {
    try {
      await ensureTableOnPool(p);
      console.log(`Leaderboard table ready on pool: ${k}`);
    } catch (err) {
      console.error(`Error ensuring table on pool ${k}:`, err && err.message ? err.message : err);
    }
  }
}

function getPoolForRegion(region) {
  if (!region) return pools.GLOBAL;
  const key = String(region).toUpperCase();
  return pools[key] || pools.GLOBAL;
}

// Insert OR update 1 row into the pool for the row.region
async function upsertScore(row) {
  const pool = getPoolForRegion(row.region);
  const sql = `
    INSERT INTO leaderboard (user_id, name, region, score, updated_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id) DO UPDATE SET
      name = EXCLUDED.name,
      region = EXCLUDED.region,
      score = EXCLUDED.score,
      updated_at = EXCLUDED.updated_at
  `;

  const params = [
    row.user_id,
    row.name || "",
    row.region || "GLOBAL",
    row.score || 0,
    row.timestamp || new Date().toISOString()
  ];

  await pool.query(sql, params);
  console.log(`Saved score for: ${row.user_id} to region DB: ${row.region || 'GLOBAL'}`);
}

// Insert OR update multiple rows
async function upsertScores(rows) {
  for (const row of rows) {
    await upsertScore(row);
  }
}

export { asia_pool, eu_pool, na_pool, global_pool, ensureTableExists, upsertScore, upsertScores, getPoolForRegion };
