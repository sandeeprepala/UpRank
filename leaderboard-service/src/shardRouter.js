import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";
import { asia_pool, eu_pool, na_pool, global_pool } from "./db.js";

/*
  You must set separate DB names in your .env file:
  PG_DATABASE_ASIA=leaderboard_asia
  PG_DATABASE_EU=leaderboard_eu
  PG_DATABASE_NA=leaderboard_na
  PG_DATABASE_GLOBAL=leaderboard_global
*/

const shards = {
  ASIA: asia_pool,
  EU: eu_pool,
  NA: na_pool, 
  GLOBAL: global_pool,
};

function getShard(region) {
  return shards[region?.toUpperCase()] || shards.GLOBAL;
}

export { shards, getShard };
