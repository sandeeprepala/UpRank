# 🚀 Real-Time Distributed Leaderboard System

![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)
![JavaScript](https://img.shields.io/badge/JavaScript-ES9+-blue?logo=javascript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Live-blue?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-Live-red?logo=redis)
![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)
![NGINX](https://img.shields.io/badge/NGINX-Reverse%20Proxy-green?logo=nginx)

A horizontally scalable, production-grade leaderboard platform designed for **real-time rankings**, **high write throughput**, and **low-latency reads**, even under millions of concurrent updates.

This system is built to solve real engineering challenges that occur in high-traffic leaderboard environments:

- Traditional DB sorting becomes too slow.
- Direct writes to Postgres cause bottlenecks.
- Global traffic spikes overload single-region setups.
- User score updates can overload queues/workers.
- Real-time reads (top N, ranks, around-me) require instant performance.

To address these, the system uses a **Redis-first architecture**, combined with **asynchronous write-behind**, **region-based sharding**, and **independent microservices**, ensuring predictable performance under heavy load.

---

# 📌 High-Level Features (With Why Each Matters)

## ⚡ Real-Time Performance  
**Why:**  
Leaderboard systems receive huge bursts of read traffic. Queries like *“top 100 players”, “player rank”, “around me”* must respond instantly.  
Database queries with `ORDER BY score DESC` do not scale.

**What this system does:**  
- Uses Redis Sorted Sets (ZSET) for ranking.
- O(log N) score updates and rank lookups.
- Reads never touch Postgres → consistent low latency.
- Real-time ranking is always available in memory.

---

## 🧩 Microservice Architecture  
**Why:**  
Monolithic systems collapse when mixing DB writes, Redis operations, and heavy reads. Microservices allow isolating responsibilities and scaling independently.

**Components:**
- **API Gateway** – auth, routing, rate-limiting, logging.
- **Leaderboard Service** – all score and ranking logic.
- **Worker Service** – async Postgres persistence layer.
- **Redis** – low-latency ranking engine.
- **Postgres** – durable backing storage.

This separation increases throughput, resilience, and scalability.

---

## 🗄️ Storage & Scaling Strategy

### PostgreSQL as Durable Storage  
**Why:**  
Redis is in-memory and volatile. Long-term analytics, dashboards, anti-cheat systems, or full restores require durable storage.

**What the system does:**  
- Stores persistent user scores.
- Uses UPSERT for idempotent writes.
- Region-based databases reduce write contention.

---

### Region-Based Sharding  
**Why:**  
Global systems cannot depend on a single region’s Redis or Postgres:  
- Latency becomes unpredictable.  
- Load concentrates unevenly.  
- Hot shards bring the system down.

**What this system does:**  
- Creates ZSET per region (`ASIA`, `EU`, `NA`, `GLOBAL`).  
- Redirects each user to the shard responsible for their region.  
- Supports future Redis Cluster upgrades.

---

# ⚡ Redis-Level Optimizations  
**Why:**  
Redis is the backbone of real-time leaderboard performance. But careless usage can cause:  
- Hotkey issues  
- Slow range queries  
- Excessive memory footprint  
- Cluster imbalance  

**Optimizations included:**  
- Region-level key partitioning.  
- ZSET structure tuned for rank, top N, and around-me queries.  
- Avoids full data scans entirely.  
- Ready for Redis Cluster adoption.

---

# 🔁 Asynchronous Write-Behind Pipeline  
**Why:**  
Writing directly to Postgres for each score update is fatal at scale:  
- Transactions block.  
- Row-level locks build up.  
- TPS collapses.  
- Latency spikes propagate to clients.

**What the system does:**  
- `leaderboard-service` performs **fast writes** to Redis.
- Pushes events to `queue:scores`.
- Worker drains queue using `BRPOP` and does **batched UPSERTs**.

This ensures Redis stays fast while Postgres stays healthy.

---

# 🛡️ Rate Limiting & Backpressure  
**Why:**  
Uncontrolled clients can spam score updates causing:  
- Queue overflow  
- Worker lag  
- Postgres overload  
- Full system collapse  

**Mechanisms:**  
### Per-User Token Bucket  
Prevents update spam from individual users.

### Per-Region Rate Limit  
Prevents region-level traffic imbalance.

### Queue Backpressure  
If queue length exceeds threshold:  
- 429 Too Many Requests
The system protects itself before failing.

---

# 🧊 Reduced DB Load  
**Why:**  
Postgres cannot serve real-time read queries for millions of users.

**Solution:**  
- All reads served from Redis.  
- Postgres only receives batched writes from worker.  
- No direct DB usage on every score update.

---

# 📡 Clean API Endpoints  
All critical leaderboard functionality is implemented:

- Register / Login  
- Update score  
- Add to score  
- Get rank  
- Get top N  
- Get around-me  
- JWT-based auth for all score operations.

---

# 🏗 Architecture Overview

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

- A load balancer sits in front of the `api-gateway` instances and routes incoming client traffic.
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
