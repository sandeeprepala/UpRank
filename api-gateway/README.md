# API Gateway

Small Express-based API Gateway that forwards leaderboard endpoints to the `leaderboard-service` and provides a Redis-backed token-bucket rate limiter.

Run locally:

```powershell
cd api-gateway
npm install
cp .env.example .env
# edit .env if needed
npm start
```

Configure `LEADERBOARD_SERVICE_URL` to point at your leaderboard service.
