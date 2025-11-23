## 🚀📊 Real-Time Distributed Leaderboard System

![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)
![JavaScript](https://img.shields.io/badge/JavaScript-ES9+-blue?logo=javascript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Live-blue?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-Live-red?logo=redis)
![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)
![NGINX](https://img.shields.io/badge/NGINX-Reverse%20Proxy-green?logo=nginx)


A fast, scalable leaderboard platform built with smart caching, sharding, and an optimized pipeline to deliver real-time rankings with smooth performance at any scale.


This project demonstrates a production-style backend architecture using:
- Redis (ZSET) for real-time ranking
- Postgres for durable storage
- A worker pipeline for async write-behind syncing
- API Gateway + microservices for clean separation
- Horizontal scalability via sharding & load balancing

---

## 🚀Postman Link for API testing after Docker Setup - https://url-shortener-microservices-1.onrender.com/Leaderboard-System-Postman


## 🚀 Features

### ⚡ Real-Time Performance
- Uses Redis Sorted Sets (ZSET) for instant rank updates.
- Reads are O(log N) and fully in-memory.

### 🧩 Microservice Architecture

- **API Gateway**
  - Handles auth and routing.
  - Proxies to internal leaderboard service.
- **Leaderboard Service**
  - Handles score updates and ranking queries.
  - Writes to Redis and enqueues events.
- **Worker Service**
  - Consumes events from Redis queue.
  - Persists scores into PostgreSQL (write-behind).

### 🗄️ Scalable Storage Layer
- Postgres stores persistent scores.
- Upsert pipeline ensures eventual consistency.
- Region-based sharding for distributed load.

### 🔁 Async Write-Behind Pipeline
- Redis LPUSH → Worker BRPOP → Batched Postgres UPSERT.
- Smooth, non-blocking flow even under heavy traffic.

### 📌 Database-Level Optimizations
- Indexed queries using `CREATE INDEX` on `user_id`, `region`, and `score DESC` for high-performance lookups.
- Region + score composite index ensures fast ranked queries during Redis recovery.
- Write-behind pipeline reduces direct DB writes, preventing bottlenecks under heavy load.
- Introduced database sharding (region-based) to scale Postgres horizontally and support high-throughput leaderboard writes at large user volumes.

### ⚡ Redis-Level Optimizations
- Region-based Redis caching (`leaderboard:ASIA`, `leaderboard:EU`, etc.) for targeted read distribution.
- Global + Regional ZSETs avoid scanning entire data sets, improving query latency.
- In-memory reads ensure constant-time access for top N, rank, and around-me requests.
- Future enhancements : Introduce Redis Cluster to distribute leaderboard ZSETs across multiple shards, improving throughput, reducing hotkey pressure, and allowing the system to scale beyond the limits of a single Redis instance.

### 🛡️ Rate Limiting & Backpressure

- **Per-User Rate Limit**:
  - Implemented as a **token bucket** stored in Redis.
  - Capacity and refill rate derived from `USER_RATE_LIMIT_COUNT` and `USER_RATE_LIMIT_WINDOW`.
- **Per-Region Rate Limit**:
  - Token bucket per region (e.g. `GLOBAL`, `ASIA`) to cap write throughput.
- **Queue Backpressure**:
  - Checks `LLEN queue:scores`.
  - If queue length exceeds `QUEUE_REJECT_LENGTH`, new score writes return `429` with `queue_full`.

All of this helps keep the system stable under heavy traffic.


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

```text
          ┌───────────┐
          │   Client   │
          └──────┬────┘
                 │ HTTP
         ┌───────▼──────────────────┐
         │       API Gateway         │
         │(Loadbalanding)           │
         └───────┬──────────────────┘
                 │
      ┌──────────▼──────────┐
      │  Leaderboard Service │
      │ (Redis + Queue Push) │
      └──────────┬──────────┘
                 │
            ZADD / ZRANGE
                 │
        ┌────────▼────────┐
        │      Redis       │
        │ ZSET + LIST      │
        └────────┬────────┘
                 │ BRPOP
       ┌─────────▼─────────┐
       │   Worker Service   │
       │ (Postgres UPSERT)  │
       └─────────┬─────────┘
                 │
           ┌─────▼──────┐
           │  Postgres   │
           └─────────────┘
```

---

**Load Balancer & Scaling Entry Point**

- A load balancer (L4 or L7) sits in front of the `api-gateway` instances and routes incoming client traffic.
- Scale the `api-gateway` horizontally behind the load balancer. Keep `api-gateway` stateless; store session-like state client-side in JWTs (already implemented) or in a distributed store.
- For high throughput, enable HTTP/2 and connection reuse at the LB level and tune keep-alive settings.

**Region-Based Sharding**

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

## Docker Setup Guide

This repository includes a complete distributed leaderboard system using Docker:
- PostgreSQL with automatic region database + table creation
- 3 Leaderboard service instances
- 3 API Gateway instances (round-robin load balancing)
- Worker service
- NGINX reverse proxy on port 8080

Follow this guide to run the entire system on any machine.

---

## 1. Requirements

- Docker 20+
- Docker Compose v2+
- Git
- A `.env` file in the project root

---

## 2. Create `.env`

Create a file named `.env` in the project root:

```text
REDIS_URL=YOUR_REDIS_URL
JWT_SECRET=your-secret-key
```

---

## 3. Project Structure

Your project must contain:

```
docker-compose.yml
.env
postgres-init/
01-init.sql
02-create-tables.sql
```

The `postgres-init` folder is automatically executed by PostgreSQL on first startup.

---

## 4. Build All Services

```powershell
docker compose build --no-cache
```

---

## 5. Start the Entire System

```powershell
docker compose up -d
```

This starts:
- Postgres
- Leaderboard services
- API Gateways (4000, 4001, 4002)
- Worker
- NGINX on port **8080**

---

## 6. Verify Postgres Initialization

Enter Postgres:

```powershell
docker exec -it leaderboard_system-postgres-1 psql -U postgres
```

List all databases:

```
\l
```

You should see:

```
leaderboard_asia
leaderboard_eu
leaderboard_na
leaderboard_global
```

Check tables:

```sql
\c leaderboard_asia
\dt
```

---

## 7. Test the System

### PowerShell

```powershell
Invoke-WebRequest -Uri "http://localhost:8080/score" -Method POST `
-Headers @{ "Content-Type"="application/json" } `
-Body '{"user_id":"dev01","region":"ASIA","score":150}'
```

### Linux/Mac

```bash
curl -X POST http://localhost:8080/score \
  -H "Content-Type: application/json" \
  -d '{"user_id":"dev01","region":"ASIA","score":150}'
```

Check worker logs:

```powershell
docker logs leaderboard_system-worker-1
```

---

## 8. Stop Everything

```powershell
docker compose down
```

Full reset:

```powershell
docker compose down -v
```

---

## 9. Useful Commands

View logs:

```powershell
docker logs leaderboard_system-api-gateway-1-1
```

Restart service:

```powershell
docker compose restart worker
```

Rebuild one service:

```powershell
docker compose build leaderboard-1
```

---

## 10. Troubleshooting

### Postgres DBs not created
Delete the Docker volume:

```powershell
docker compose down -v
docker volume rm leaderboard_system_pgdata
docker compose up -d
```

### ENV not detected
Ensure `.env` is in the project root.

---

## 11. Notes

- Do not rename files inside `postgres-init`.
- New schema updates should use migration files.
- Do not commit `.env` to Git.

---

## Done

Your distributed leaderboard cluster should now run identically on any machine.
### API Gateway Load Balancing

The `api-gateway` can also perform simple round-robin load balancing across multiple `leaderboard-service` instances. Use the `LEADERBOARD_SERVICE_URLS` environment variable to list backend URLs (comma-separated). Example:

```powershell
# set upstreams and start gateway on port 4000
$env:LEADERBOARD_SERVICE_URLS = 'http://localhost:5001,http://localhost:5002,http://localhost:5003'
$env:PORT=4000; node api-gateway/src/index.js
```

- The gateway exposes a `/health` endpoint that returns the configured upstreams and a quick status: `GET /health`.
- The gateway will round-robin incoming requests across the configured upstreams and logs which upstream handled each request.
- Use the gateway when you want to hide internal service addresses without installing NGINX; NGINX may still be used in front of multiple gateway instances for higher availability.

Testing notes:

- Send client requests to the gateway (example `http://localhost:4000/auth/register`) or to NGINX if you prefer that entrypoint (`http://localhost:8080`).
- To verify distribution, watch the gateway logs (each proxied request logs the chosen upstream), or use `X-Upstream-Addr` when proxying through NGINX.

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

## Running the full stack with Docker Compose

The repository includes a `docker-compose.yml` that starts Postgres, three `leaderboard-service` containers, three `api-gateway` containers, the `worker` and NGINX. The stack expects you to provide your Upstash `REDIS_URL` and a `JWT_SECRET` via environment.

1. Create a `.env` file next to `docker-compose.yml` with:

```text
REDIS_URL=<your-upstash-redis-url>
JWT_SECRET=supersecret
```

2. Build and start everything:

```powershell
docker compose up --build
```

Notes:
- NGINX will be available on `http://localhost:8080` and forwards to the three api-gateway containers.
- The api-gateway containers are exposed on host ports `4000`, `4001`, `4002` for debugging, while the leaderboard containers listen on `5000` internally (gateway talks to them directly).
- If you prefer scaling differently, you can modify the `docker-compose.yml` to add/remove instances or use `docker compose up --scale` against a single service definition.

If you want, I can also add a small `.env.example` file and a PowerShell script to bring up the stack and tail logs.

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
