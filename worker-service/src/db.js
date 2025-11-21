import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

// Simple DB connection
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "leaderboard",
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
  password: process.env.PGPASSWORD || undefined,
});

pool.on("connect", () => {
  console.log("Connected to Postgres");
});

// Create table if not exists
async function ensureTableExists() {
  const create = `
    CREATE TABLE IF NOT EXISTS leaderboard (
      user_id TEXT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      region VARCHAR(50) NOT NULL,
      score BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await pool.query(create);
  console.log("Leaderboard table ready");
}

// Insert OR update 1 row
async function upsertScore(row) {
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
  console.log("Saved score for:", row.user_id);
}

// Insert OR update multiple rows
async function upsertScores(rows) {
  for (const row of rows) {
    await upsertScore(row);
  }
}

export { pool, ensureTableExists, upsertScore, upsertScores };
