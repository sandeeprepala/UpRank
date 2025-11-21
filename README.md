## 🚀📊 Real-Time Leaderboard System

A fast, scalable leaderboard platform built with smart caching, sharding, and an optimized pipeline to deliver real-time rankings with smooth performance at any scale.

This project demonstrates a production-style backend architecture using:
- Redis (ZSET) for real-time ranking
- Postgres for durable storage
- A worker pipeline for async write-behind syncing
- API Gateway + microservices for clean separation
- Horizontal scalability via sharding & load balancing

---

## 🚀 Features

### ⚡ Real-Time Performance
- Uses Redis Sorted Sets (ZSET) for instant rank updates.
- Reads are O(log N) and fully in-memory.

### 🧩 Microservice Architecture
- **API Gateway** (routing + rate limiting)
- **Leaderboard Service** (score updates + query endpoints)
- **Worker Service** (pipeline sync to Postgres)

### 🗄️ Scalable Storage Layer
- Postgres stores persistent scores.
- Upsert pipeline ensures eventual consistency.
- Region-based sharding for distributed load.

### 🔁 Optimized Data Pipeline
- Redis LPUSH → Worker BRPOP → Batched Postgres UPSERT.
- Smooth, non-blocking flow even under heavy traffic.

### 📌 Database-Level Optimizations
- Indexed queries using `CREATE INDEX` on `user_id`, `region`, and `score DESC` for high-performance lookups.
- Region + score composite index ensures fast ranked queries during Redis recovery.
- Write-behind pipeline reduces direct DB writes, preventing bottlenecks under heavy load.

### ⚡ Redis-Level Optimizations
- Region-based Redis caching (`leaderboard:ASIA`, `leaderboard:EU`, etc.) for targeted read distribution.
- Global + Regional ZSETs avoid scanning entire data sets, improving query latency.
- In-memory reads ensure constant-time access for top N, rank, and around-me requests.

### 🔁 Reduced DB Load
- Most reads served from Redis → drastically cuts down DB traffic.
- Score updates push to Redis first, then asynchronously synced to Postgres (write-optimized).
- No repetitive DB queries for ranking since Redis maintains sorted user scores.


### 🧪 Clean API Endpoints
- Update score
- Get top N
- Get user rank
- Fetch around-me results


---

## 🏗️ Architecture Overview

1. Client calls `api-gateway` (or directly calls `leaderboard-service`) with a JWT token.
2. `leaderboard-service` updates the Redis ZSET (leaderboard) and the per-user hash `user:{user_id}` with metadata and `score`.
3. `leaderboard-service` enqueues a normalized event (`{ user_id, name, region, score, timestamp }`) onto `queue:scores`.
4. `worker-service` consumes queue items and upserts them into PostgreSQL for analytics, backups, or complex queries.

This separation enables fast reads (Redis) and durable storage (Postgres), and supports horizontal scaling.

---

**Load Balancer & Scaling Entry Point**

- A load balancer (L4 or L7) sits in front of the `api-gateway` instances and routes incoming client traffic.
- Scale the `api-gateway` horizontally behind the load balancer. Keep `api-gateway` stateless; store session-like state client-side in JWTs (already implemented) or in a distributed store.
- For high throughput, enable HTTP/2 and connection reuse at the LB level and tune keep-alive settings.

**Region-Based Sharding (Logical)**

- This project supports a region-based logical sharding model: each region (e.g., `GLOBAL`, `ASIA`, `EU`, `NA`) maps to its own Redis ZSET namespace, and you can route writes and reads for a user to the shard responsible for their region.
- Common shard strategies:
  - Static region - >shard map: easiest to reason about. Example: `ASIA` -> `redis-cluster-asia`, `EU` -> `redis-cluster-eu`.
  - Hash-based sharding (consistent hashing): map `user_id` to a shard so load is balanced even when users are spread unevenly.
- Implementation notes for this repo:
  - `leaderboard-service` contains a simple `shardRouter` concept (stub). Replace it with a real mapping to pick the correct Redis client and queue key per region.
  - Use a separate queue per shard (e.g., `queue:scores:asia`) so workers can be colocated with the shard or consume from the shard's queue only.
---

## Repository Structure

```
Leaderboard_System/
├─ api-gateway/
│  ├─ src/
│  └─ Dockerfile
├─ leaderboard-service/
│  ├─ src/
│  └─ Dockerfile
├─ worker-service/
│  ├─ src/
│  └─ Dockerfile
└─ README.md
```

---

## Getting Started (Local Development)

Prerequisites:

- Node.js 18+ (recommended)
- PostgreSQL (12+)
- Redis (or Upstash Redis URL)
- `psql` (optional, for DB checks)

1. Clone repository and install per-service dependencies:

```powershell
cd C:\Users\sande\Desktop\Leaderboard_System\leaderboard-service
npm install
cd ..\api-gateway
npm install
cd ..\worker-service
npm install
```

2. Configure environment variables: copy `.env.example` in each service and set values.

Important variables (per service):

- `REDIS_URL` — Redis connection string (Upstash or self-hosted). Example: `redis://127.0.0.1:6379`.
- `JWT_SECRET` — strong secret used to sign tokens (leaderboard-service).
- Postgres (worker-service): either `PG_CONNECTION` or the standard `PGUSER`, `PGHOST`, `PGDATABASE`, `PGPORT`, `PGPASSWORD`.

3. Start services (in separate terminals):

```powershell
# Leaderboard service
cd leaderboard-service
npm run dev

# Worker service
cd ..\worker-service
npm run dev

# API Gateway
cd ..\api-gateway
npm run dev
```

4. Register a user and get a token:

```powershell
curl -X POST http://localhost:4000/auth/register -H "Content-Type: application/json" -d "{\"user_id\":\"user-1\",\"name\":\"Alice\",\"region\":\"GLOBAL\"}"
```

The gateway proxies to the leaderboard service and returns a JSON object with a `token` you can use for authenticated requests.

---

## API Reference (quick)

All `score` endpoints require a Bearer token (except register/login):

- `POST /auth/register` (body: `user_id`, `name`, `region`, optional `initialScore`) → registers a user and returns `{ token }`.
- `POST /auth/login` (body: `user_id`, `name`, optional `region`) → returns `{ token }`.

- `POST /score/create` — Auth required. Body: `{ region, initialScore }` — creates leaderboard entry for `req.user`.
- `POST /score/update` — Auth required. Body: `{ score }` — sets the user's score (user from token).
- `POST /score/add` — Auth required. Body: `{ delta }` — increments the user's score.

- `GET /top?region=GLOBAL&limit=100` — returns top N rows.
- `GET /rank/:userId?region=GLOBAL` — returns user's rank and score.
- `GET /around/:userId?region=GLOBAL&range=10` — returns neighbors around a user (excludes the user from `around`, but includes `self` object with rank/score).

Requests can be proxied through `api-gateway` (default `http://localhost:4000`) or sent directly to `leaderboard-service` (default `http://localhost:5000`).

---

## Redis Data Model

- ZSET per region: `leaderboard:{region}` — member value is `user_id`, score is numeric value.
- Hash per user: `user:{user_id}` — stores `{ name, region, score, updated_at }` for quick lookups.
- Queue list: `queue:scores` — LPUSH from service, RPOP/BRPOP by worker.

---

## PostgreSQL Schema

`worker-service` will create the `leaderboard` table automatically on startup if it doesn't exist. The table schema:

```sql
CREATE TABLE IF NOT EXISTS leaderboard (
  user_id TEXT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  region VARCHAR(50) NOT NULL,
  score BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

The worker persists each event with `INSERT ... ON CONFLICT(user_id) DO UPDATE` so it is idempotent per latest score write.

---

## Security & JWT

- Tokens include `user_id`, `name`, and `region`. Services rely on the `req.user` object extracted by the `auth` middleware.
- Keep `JWT_SECRET` private and use a secure value in production.

---

## Running with Docker (outline)

Each service contains a `Dockerfile`. You can build images per service and run them in containers, wiring them together with Docker Compose (not included) or your orchestration of choice.

---

## Helpful Scripts

- `worker-service/scripts/check_queue.js` — prints `LLEN queue:scores` and up to 20 items for quick debugging.

---

## Troubleshooting

- Worker not persisting rows:
  - Ensure `worker-service` has correct Postgres env vars and can connect to the DB.
  - Check worker logs for `ensureTableExists`, `upsertScore`, and any SQL errors.
  - Use `psql` to inspect the `leaderboard` table.

- Queue looks empty:
  - Ensure `leaderboard-service` is connected to the same `REDIS_URL` and you see `lPush` operations in logs when updating/adding scores.
  - Use `worker-service/scripts/check_queue.js` to inspect the queue.

---

## License & Contribution

This project is a reference implementation — feel free to fork, improve, or adapt for your needs. Add contributors and license as appropriate.

---
