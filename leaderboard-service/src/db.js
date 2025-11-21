import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "leaderboard",
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
  password: process.env.PGPASSWORD || undefined,
});

export default pool;
