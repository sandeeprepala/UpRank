# Leaderboard Service

Core service responsible for updating Redis ZSETs and producing events for persistence.

Run locally:

```powershell
cd leaderboard-service
npm install
cp .env.example .env
# edit .env
npm start
```

Endpoints (mounted at `/`):
- POST `/score/update` body { user_id, name, region, score }
- GET `/top?region=ASIA&limit=100`
- GET `/rank/:userId?region=ASIA`
- GET `/around/:userId?region=ASIA&range=10`
