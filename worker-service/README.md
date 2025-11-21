# Worker Service

Consumes score update events from Redis and persists them to Postgres in batches.

Run locally:

```powershell
cd worker-service
npm install
cp .env.example .env
npm start
```
