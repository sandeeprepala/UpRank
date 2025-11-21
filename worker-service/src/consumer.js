import client from './redisClient.js';
import { upsertScore } from './db.js';

let running = true;

const QUEUE_KEY = 'queue:scores';

// simple sleep
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function consumeLoop() {
  while (running) {
    try {
      // block for 5 seconds waiting for new item
      const res = await client.brPop(QUEUE_KEY, 5);

      if (res) {
        const raw = Array.isArray(res) ? res[1] : res.element;
        const item = JSON.parse(raw);

        console.log("Worker received:", item);

        // write to postgres
        await upsertScore(item);
      }

    } catch (err) {
      console.error("Worker error:", err.message || err);
      await delay(1000); // wait and try again
    }
  }

  // on shutdown
  try { await client.quit(); } catch (e) {}
}

function stop() {
  running = false;
}

process.on('SIGINT', () => {
  console.log("Worker shutting down...");
  stop();
});
process.on('SIGTERM', () => {
  console.log("Worker shutting down...");
  stop();
});

export { consumeLoop, stop };
