import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

// const pool = new Pool({
//   user: process.env.PGUSER,
//   host: process.env.PGHOST || "localhost",
//   database: process.env.PGDATABASE || "leaderboard",
//   port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
//   password: process.env.PGPASSWORD || undefined,
// });

const asia_pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PG_DATABASE_ASIA,
    port: process.env.PGPORT,
    password: process.env.PGPASSWORD,
  })

  const eu_pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PG_DATABASE_EU,
    port: process.env.PGPORT,
    password: process.env.PGPASSWORD,
  })

  const na_pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PG_DATABASE_NA,
    port: process.env.PGPORT,
    password: process.env.PGPASSWORD,
  })

  const global_pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PG_DATABASE_GLOBAL,
    port: process.env.PGPORT,
    password: process.env.PGPASSWORD,
  })

export {asia_pool,eu_pool,na_pool,global_pool};
