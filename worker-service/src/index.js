import 'dotenv/config';
import express from 'express';
import { consumeLoop } from './consumer.js';
import { ensureTableExists } from './db.js';

async function startWorker() {
  console.log("Worker starting...");

  try {
    await ensureTableExists();
    console.log("Ensured leaderboard table exists");
  } catch (err) {
    console.error("Error ensuring leaderboard table exists", err);
  }

  // Start queue consumer (non-blocking)
  consumeLoop().catch(err => console.error("Worker crashed:", err));
}

// ---- HEALTH SERVER (PREVENT RENDER SLEEP) ----
function startHealthServer() {
  const app = express();
  const port = process.env.PORT || 7000;  // Render requires PORT env

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'worker' });
  });

  app.listen(port, () => {
    console.log(`Worker health server running on port ${port}`);
  });
}

// Start both
startHealthServer();
startWorker();
