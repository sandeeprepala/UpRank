import client from './redisClient.js';
import { upsertScore } from './db.js';

let running = true;

const QUEUE_KEY = 'queue:scores';

// simple sleep
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function consumeLoop() {
  while (running) {
    try {
      // Backpressure: check queue length and slow down if too large
      try {
        const qlen = await client.lLen(QUEUE_KEY);
        const HIGH = parseInt(process.env.WORKER_BACKPRESSURE_HIGH || '100000', 10);
        const MEDIUM = parseInt(process.env.WORKER_BACKPRESSURE_MEDIUM || '50000', 10);
        if (qlen >= HIGH) {
          console.warn(`Queue very large (${qlen}), backing off`);
          await delay(5000);
          continue;
        } else if (qlen >= MEDIUM) {
          console.warn(`Queue large (${qlen}), slowing consumption`);
          await delay(2000);
        }
      } catch (e) {
        // ignore lLen errors and continue
      }

      // block for 5 seconds waiting for new item
      const res = await client.brPop(QUEUE_KEY, 5);

      if (res) {
        const raw = Array.isArray(res) ? res[1] : res.element;
        const item = JSON.parse(raw);

        console.log("Worker received:", item);

        // write to postgres: always write to item's region and also to GLOBAL
        try {
          await upsertScore(item);
        } catch (e) {
          console.error('Failed upsert to region DB:', e && e.message ? e.message : e, 'item=', item);
        }

        // duplicate to GLOBAL to keep a global copy (skip if already GLOBAL)
        if (!item.region || String(item.region).toUpperCase() !== 'GLOBAL') {
          const globalItem = { ...item, region: 'GLOBAL' };
          try {
            await upsertScore(globalItem);
            console.log(`Also upserted to GLOBAL for user ${item.user_id}`);
          } catch (e) {
            console.error('Failed upsert to GLOBAL DB:', e && e.message ? e.message : e, 'item=', globalItem);
          }
        }
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
